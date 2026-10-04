import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getEmailConfig } from "../_shared/email-sender.ts";
import { injectPreheader } from "../_shared/email-prepare.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { safeParseAudienceReference, resolveRecipients } from "./audience-resolvers.ts";
import { getSuppressedEmailSet } from "./send-helpers.ts";
import { buildQueue, queueCount, type Sender } from "./queue.ts";
import { processCampaign } from "./processor.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

/**
 * Envio de campanha. Esta chamada só PREPARA e responde na hora (202):
 *   1. valida a campanha e monta a fila de destinatários (email_send_queue);
 *   2. dispara o processador em segundo plano, que envia em lotes, continua sozinho em outra chamada se o tempo
 *      acabar e é reativado pelo watchdog (cron) se algo cair.
 * Chamada interna com { action: "resume" } só reativa o processador (continuação automática e watchdog).
 */
serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const cid = getCorrelationId(req);
  const log = createLogger("email-campaign-send", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  let campaignId: string | null = null;

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json();
    campaignId = String(payload?.campaign_id || "").trim();
    if (!campaignId) throw new Error("Missing campaign_id");

    // Continuação / watchdog: só reativa o processador
    if (auth.isInternal && payload?.action === "resume") {
      EdgeRuntime.waitUntil(processCampaign(supabase, supabaseUrl, campaignId, log));
      return json({ success: true, resumed: true }, 202);
    }

    let tenantId: string;
    if (auth.isInternal) {
      const { data: camp } = await supabase.from("email_campaigns").select("tenant_id").eq("id", campaignId).single();
      if (!camp?.tenant_id) throw new Error("Campaign not found");
      tenantId = camp.tenant_id;
    } else {
      tenantId = auth.tenantId!;
      await requireResource(supabase, "email_campaigns", campaignId, tenantId, req);
    }

    const fail = async (message: string, status = 400) => {
      await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: message }).eq("id", campaignId as string).eq("tenant_id", tenantId);
      return json({ success: false, error: message }, status);
    };

    const { data: campaign, error: claimError } = await supabase
      .from("email_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString(), error_message: null, completed_at: null, send_lease_until: null })
      .eq("id", campaignId).eq("tenant_id", tenantId).in("status", ["draft", "scheduled", "paused", "error"])
      .select("id, tenant_id, status, subject, content_html, preheader, email_integration_id, audience_type, audience_reference, ab_test_id, ab_variant, ab_split_pct, ab_offset_pct")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!campaign) return json({ success: false, error: "Campanha já foi enviada ou está em andamento" }, 409);

    // Já existe fila (campanha pausada ou que caiu no meio): só retoma, sem montar a fila de novo
    const existing = await queueCount(supabase, campaignId);
    if (existing > 0) {
      EdgeRuntime.waitUntil(processCampaign(supabase, supabaseUrl, campaignId, log));
      return json({ success: true, queued: existing, resumed: true }, 202);
    }

    // Só o HTML salvo pelo editor vai no envio (é o que você viu na pré-visualização)
    if (!campaign.content_html) {
      return await fail("Esta campanha não tem conteúdo salvo. Abra a campanha no editor, confira o e-mail e salve antes de enviar.");
    }
    const baseHtml = injectPreheader(campaign.content_html, campaign.preheader);
    const hasUnsubscribeVariable = baseHtml.includes("{{unsubscribe_url}}");
    await supabase.from("email_campaigns").update({ has_unsubscribe_link: hasUnsubscribeVariable, compliance_checked_at: new Date().toISOString() }).eq("id", campaignId).eq("tenant_id", tenantId);
    if (!hasUnsubscribeVariable) {
      return await fail("Envio bloqueado: inclua {{unsubscribe_url}} no conteúdo da campanha (bloco Descadastrar).");
    }
    if (!campaign.email_integration_id) {
      return await fail("Esta campanha não tem integração de e-mail configurada. Edite a campanha em Email Marketing e selecione uma integração SMTP antes de enviar.");
    }
    const integrationId: string = campaign.email_integration_id;

    const { data: integrationRow } = await supabase.from("email_integrations").select("daily_send_limit").eq("id", integrationId).single();
    const dailySendLimit: number | null = integrationRow?.daily_send_limit ?? null;

    const { config: emailConfig, error: configError } = await getEmailConfig(supabase, integrationId);
    if (configError || !emailConfig) return await fail(configError || "Configuração de e-mail inválida");

    const senders: Sender[] = [{ email: emailConfig.senderEmail || emailConfig.smtpUser, name: emailConfig.senderName }];
    const { data: extraSenders } = await supabase.from("email_integration_senders").select("sender_email, sender_name").eq("integration_id", integrationId).eq("is_active", true);
    for (const s of extraSenders ?? []) senders.push({ email: s.sender_email, name: s.sender_name || emailConfig.senderName });

    const recipients = await resolveRecipients(supabase, tenantId, String(campaign.audience_type || "all"), safeParseAudienceReference(campaign.audience_reference));
    if (!recipients.length) {
      return await fail("Nenhum destinatário na audiência. Confira a lista ou o segmento escolhido e tente de novo.");
    }

    const suppressed = await getSuppressedEmailSet(supabase, tenantId, recipients.map((r) => r.email));
    let eligible = recipients.filter((r) => !suppressed.has(r.email));

    // Teste A/B: cada variante envia uma fatia da audiência
    if (campaign.ab_test_id && campaign.ab_variant) {
      const split = campaign.ab_split_pct ?? 50;
      const offset = campaign.ab_offset_pct ?? 0;
      eligible.sort((a, b) => a.email.localeCompare(b.email));
      const total = eligible.length;
      const start = Math.floor(total * offset / 100);
      eligible = eligible.slice(start, Math.min(total, start + Math.ceil(total * split / 100)));
      log.info(`[A/B] variante=${campaign.ab_variant} fatia=[${start}, ${start + eligible.length}) de ${total}`);
    }

    // Cota diária da integração (só envios reais)
    if (dailySendLimit && dailySendLimit > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from("email_campaign_logs").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("is_test", false).in("status", ["delivered", "sent"]).gte("sent_at", since);
      const remaining = Math.max(dailySendLimit - (count || 0), 0);
      log.info(`[EMAIL-CAMPAIGN-SEND] cota diária: ${count || 0}/${dailySendLimit}, restam ${remaining}`);
      if (remaining === 0) return await fail(`Cota diária atingida (${dailySendLimit} e-mails em 24 h). Tente novamente mais tarde.`, 429);
      if (eligible.length > remaining) eligible = eligible.slice(0, remaining);
    }
    if (!eligible.length) return await fail("Todos os destinatários estão na lista de supressão (descadastrados ou com endereço inválido).");

    if (suppressed.size > 0) {
      await supabase.from("email_campaign_logs").insert({ tenant_id: tenantId, campaign_id: campaignId, event_type: "suppression_filtered", event_data: { total_candidates: recipients.length, suppressed: suppressed.size, eligible: eligible.length }, status: "info", is_test: false });
    }

    const queued = await buildQueue(supabase, tenantId, campaignId, eligible, senders);
    await supabase.from("email_campaigns").update({ total_recipients: queued }).eq("id", campaignId);

    EdgeRuntime.waitUntil(processCampaign(supabase, supabaseUrl, campaignId, log));
    return json({ success: true, queued, suppressed: suppressed.size }, 202);
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[EMAIL-CAMPAIGN-SEND]", error);

    if (campaignId) {
      try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("email_campaigns").update({ status: "error", completed_at: new Date().toISOString(), error_message: (error as Error)?.message || "Erro inesperado no envio" }).eq("id", campaignId);
      } catch { /* noop */ }
    }
    return json({ success: false, error: (error as Error)?.message || "Unexpected error" }, 400);
  }
});
