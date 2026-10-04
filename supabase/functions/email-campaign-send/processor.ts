import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getEmailConfig } from "../_shared/email-sender.ts";
import { RateLimiter, SmtpSession } from "../_shared/email-sender-pool.ts";
import { injectPreheader, htmlToText, listUnsubscribeHeaders } from "../_shared/email-prepare.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import { injectTracking } from "./send-helpers.ts";
import { queueProgress } from "./queue.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
interface QueueRow {
  id: string; tenant_id: string; campaign_id: string;
  recipient_email: string; recipient_name: string | null; recipient_phone: string | null;
  sender_email: string | null; sender_name: string | null; attempts: number;
}

const TIME_BUDGET_MS = 100_000;      // o runtime dá ~150 s; depois disso a execução continua em outra chamada
const SAFETY_MS = 20_000;            // não começa lote novo faltando menos que isto
const BATCH_SIZE = 40;
const WORKERS = 4;                   // conexões SMTP em paralelo
const LEASE_SECONDS = 150;
const DEFAULT_SENDS_PER_SECOND = 10; // sem limite configurado na integração (o SES no sandbox aceita só 1/s: configure na integração)

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** Processa a fila da campanha em lotes até acabar ou esgotar o tempo da chamada (aí chama a si mesma de novo). */
export async function processCampaign(supabase: Supabase, supabaseUrl: string, campaignId: string, log: Log): Promise<void> {
  // trava: só um processador por campanha (o watchdog e a continuação automática não podem rodar juntos)
  const { data: leased } = await supabase.from("email_campaigns")
    .update({ send_lease_until: inSeconds(LEASE_SECONDS) })
    .eq("id", campaignId).eq("status", "sending")
    .or(`send_lease_until.is.null,send_lease_until.lt.${new Date().toISOString()}`)
    .select("id, tenant_id, subject, content_html, preheader, coupon_codes, email_integration_id");
  const campaign = leased?.[0];
  if (!campaign) return;

  const deadline = Date.now() + TIME_BUDGET_MS;
  let abortMessage: string | null = null;
  const sessions: SmtpSession[] = [];
  let leaseReleased = false; // ao continuar em outra chamada, a trava já é do novo processador

  try {
    const { config, error: configError } = await getEmailConfig(supabase, campaign.email_integration_id);
    if (configError || !config) throw new Error(configError || "Configuração de e-mail inválida");
    const { data: integ } = await supabase.from("email_integrations").select("max_sends_per_second").eq("id", campaign.email_integration_id).single();
    const limiter = new RateLimiter(integ?.max_sends_per_second ?? DEFAULT_SENDS_PER_SECOND);
    for (let i = 0; i < WORKERS; i++) sessions.push(new SmtpSession(config));

    const baseHtml = injectPreheader(campaign.content_html as string, campaign.preheader as string | null);
    const coupon = (campaign.coupon_codes as string[] | null)?.[0] || "";
    const tenantId = campaign.tenant_id as string;

    while (Date.now() < deadline - SAFETY_MS && !abortMessage) {
      const { data: current } = await supabase.from("email_campaigns").select("status").eq("id", campaignId).single();
      if (current?.status !== "sending") break; // pausada ou cancelada: para no fim do lote atual

      const { data: batch, error: claimError } = await supabase.rpc("claim_email_send_batch", { p_campaign_id: campaignId, p_limit: BATCH_SIZE });
      if (claimError) throw claimError;
      const rows = (batch ?? []) as QueueRow[];
      if (!rows.length) break;

      await supabase.from("email_campaigns").update({ send_lease_until: inSeconds(LEASE_SECONDS) }).eq("id", campaignId);

      // um token (descadastro + rastreio) por destinatário, gravado de uma vez para o lote. Quem voltou à fila depois de
      // uma queda já tem token (único por campanha + e-mail): reaproveita o mesmo, senão o link do e-mail anterior morreria.
      const { error: tokenError } = await supabase.from("email_unsubscribe_tokens").upsert(
        rows.map((r) => ({ tenant_id: tenantId, campaign_id: campaignId, recipient_email: r.recipient_email, recipient_name: r.recipient_name })),
        { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true },
      );
      if (tokenError) throw tokenError;
      const { data: tokenRows, error: lookupError } = await supabase.from("email_unsubscribe_tokens").select("id, recipient_email")
        .eq("campaign_id", campaignId).in("recipient_email", rows.map((r) => r.recipient_email));
      if (lookupError) throw lookupError;
      const tokenByEmail = new Map((tokenRows ?? []).map((t) => [t.recipient_email as string, t.id as string]));
      const tokenIds = new Map(rows.map((r) => [r.id, tokenByEmail.get(r.recipient_email) ?? crypto.randomUUID()]));

      let next = 0;
      await Promise.all(sessions.map(async (session) => {
        while (!abortMessage) {
          const row = rows[next++];
          if (!row) return;
          const tokenId = tokenIds.get(row.id)!;
          const unsubscribeUrl = `${supabaseUrl}/functions/v1/email-unsubscribe?token=${tokenId}`;
          const data = {
            first_name: row.recipient_name?.split(" ")[0] || "",
            last_name: row.recipient_name?.split(" ").slice(1).join(" ") || "",
            email: row.recipient_email, phone: row.recipient_phone || "", company: "",
            coupon_code: coupon, unsubscribe_url: unsubscribeUrl,
          };
          // 1) variáveis, 2) versão em texto (links reais), 3) rastreio só no HTML
          const personalizedBase = replaceVariables(baseHtml, data);
          const subject = replaceVariables(campaign.subject as string, data);
          await limiter.wait();
          const result = await session.send(
            { email: row.sender_email || config.senderEmail || config.smtpUser, name: row.sender_name || config.senderName },
            {
              to: row.recipient_email, subject,
              text: htmlToText(personalizedBase) || subject,
              html: injectTracking(personalizedBase, supabaseUrl, tokenId),
              headers: listUnsubscribeHeaders(unsubscribeUrl),
            },
          );

          if (result.auth) {
            // usuário/senha SMTP recusados: devolve este e-mail à fila e interrompe a campanha inteira
            await supabase.from("email_send_queue").update({ status: "pending", attempts: Math.max(row.attempts - 1, 0), claimed_at: null }).eq("id", row.id);
            abortMessage = `O servidor SMTP recusou o login (${result.error}). Confira usuário e senha em Integrações → E-mail e reenvie.`;
            return;
          }

          const nowIso = new Date().toISOString();
          const ok = result.success;
          await Promise.all([
            supabase.from("email_send_queue").update({ status: ok ? "sent" : "failed", error_message: ok ? null : (result.error ?? "Falha no envio"), processed_at: nowIso }).eq("id", row.id),
            supabase.from("email_campaign_logs").insert({
              tenant_id: tenantId, campaign_id: campaignId, recipient_email: row.recipient_email, recipient_name: row.recipient_name,
              sender_email: row.sender_email, status: ok ? "delivered" : "failed", error_message: ok ? null : result.error,
              sent_at: ok ? nowIso : null, delivered_at: ok ? nowIso : null,
              event_type: ok ? "delivery_accepted" : "delivery_failed",
              event_data: { provider: "smtp", sender: row.sender_email, attempts: result.attempts, permanent: result.permanent ?? false },
              is_test: false,
            }),
          ]);
        }
      }));
    }

    leaseReleased = await finishOrContinue(supabase, supabaseUrl, campaignId, abortMessage, log);
  } catch (error) {
    log.error("[EMAIL-PROCESSOR]", error);
    await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: (error as Error)?.message || "Erro inesperado no envio" }).eq("id", campaignId);
  } finally {
    await Promise.all(sessions.map((s) => s.close()));
    if (!leaseReleased) await supabase.from("email_campaigns").update({ send_lease_until: null }).eq("id", campaignId);
  }
}

/** Devolve true quando a trava foi passada adiante (continuação automática). */
async function finishOrContinue(supabase: Supabase, supabaseUrl: string, campaignId: string, abortMessage: string | null, log: Log): Promise<boolean> {
  if (abortMessage) {
    await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: abortMessage }).eq("id", campaignId);
    return false;
  }
  const { data: current } = await supabase.from("email_campaigns").select("status").eq("id", campaignId).single();
  if (current?.status !== "sending") return false; // pausada: o botão de enviar retoma

  const p = await queueProgress(supabase, campaignId);
  if (p.pending + p.sending === 0) {
    const finalStatus = p.sent === 0 && p.failed > 0 ? "error" : "sent";
    const nowIso = new Date().toISOString();
    await supabase.from("email_campaigns").update({
      status: finalStatus, completed_at: nowIso, sent_at: nowIso,
      total_recipients: p.total, total_sent: p.sent, total_delivered: p.sent,
      error_message: finalStatus === "error" ? "Nenhum e-mail foi enviado. Veja o motivo na aba Logs." : null,
    }).eq("id", campaignId);
    log.info(`[EMAIL-PROCESSOR] campanha concluída: ${p.sent} enviados, ${p.failed} falhas de ${p.total}`);
    return false;
  }

  // ainda há fila: libera a trava e chama a si mesma para continuar (o watchdog do cron cobre se esta chamada falhar)
  await supabase.from("email_campaigns").update({ send_lease_until: null }).eq("id", campaignId);
  try {
    await fetch(`${supabaseUrl}/functions/v1/email-campaign-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
      body: JSON.stringify({ campaign_id: campaignId, action: "resume" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    log.error("[EMAIL-PROCESSOR] continuação falhou, o watchdog retoma em até 1 min:", e);
  }
  return true;
}
