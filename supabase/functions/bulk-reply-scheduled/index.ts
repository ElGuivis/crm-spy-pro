// Envia as respostas automáticas do disparo que chegaram FORA do horário da campanha (reply_status 'scheduled',
// gravadas por _shared/wa-webhook-bulk-reply.ts). Cron `bulk-reply-scheduled` a cada 2 min (migration 20261127000001).
// Só envia com a janela da campanha aberta (Brasília), espaçado (20–45 s entre mensagens, "digitando..." antes)
// e no máximo PER_RUN por campanha por chamada, para não sair uma rajada quando a janela abre.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { sendTextWithTokenCharge } from "../_shared/whatsapp-sender.ts";
import { renderBulkMessage } from "../_shared/spintax.ts";
import { replyWindowOpen } from "../_shared/bulk-schedule.ts";
import { humanPause, planReplyDelay } from "../_shared/bulk-reply-humanize.ts";

const PER_RUN = 3;
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Claimed {
  contact_id: string; tenant_id: string; name: string | null; variables: Record<string, unknown> | null;
  reply_message: string; reply_integration_id: string | null; reply_phone: string | null; reply_conversation_id: string | null;
}

Deno.serve(async (req) => {
  const log = createLogger("bulk-reply-scheduled", getCorrelationId(req));
  try {
    await requireInternalAuth(req);
    const url = Deno.env.get("EVOLUTION_API_URL"), key = Deno.env.get("EVOLUTION_API_KEY");
    if (!url || !key) return json({ error: "Evolution API not configured" }, 500);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: due } = await supabase.from("campaign_contacts").select("campaign_id")
      .or("reply_status.eq.scheduled,and(reply_status.eq.sending,reply_claimed_at.not.is.null)").limit(500);
    const campaignIds = [...new Set((due ?? []).map((r: { campaign_id: string }) => r.campaign_id))];
    if (!campaignIds.length) return json({ success: true, sent: 0 });

    const { data: camps } = await supabase.from("bulk_campaigns").select("id, sending_schedule, timezone").in("id", campaignIds);
    let sent = 0, failed = 0, waiting = 0;
    for (const c of camps ?? []) {
      if (!replyWindowOpen(c.sending_schedule, c.timezone)) { waiting++; continue; }
      const { data: rows, error } = await supabase.rpc("claim_scheduled_bulk_replies", { _campaign_id: c.id, _limit: PER_RUN });
      if (error) { log.error("claim_scheduled_bulk_replies", { error: error.message }); continue; }
      const claimed = (rows ?? []) as Claimed[];

      const integrationIds = [...new Set(claimed.map((r) => r.reply_integration_id).filter(Boolean))] as string[];
      const { data: ints } = integrationIds.length
        ? await supabase.from("integrations").select("id, metadata").in("id", integrationIds)
        : { data: [] };
      const instanceById = new Map((ints ?? []).map((i: { id: string; metadata: { instanceName?: string } | null }) => [i.id, i.metadata?.instanceName]));

      for (const [i, r] of claimed.entries()) {
        const instanceName = r.reply_integration_id ? instanceById.get(r.reply_integration_id) : undefined;
        if (!instanceName || !r.reply_phone) {
          await supabase.from("campaign_contacts").update({ reply_status: "failed" }).eq("id", r.contact_id);
          failed++; continue;
        }
        if (i > 0) await sleep(20_000 + Math.floor(Math.random() * 25_000));
        const config = { evolutionApiUrl: url, evolutionApiKey: key, instanceName };
        const text = renderBulkMessage(r.reply_message, r.name, r.variables);
        // "digitando..." curto antes (sem marcar como lida: a mensagem é antiga)
        const plan = planReplyDelay(3, 8, text.length);
        await humanPause(config, r.reply_phone, null, plan, (m) => log.warn(m));
        const res = await sendTextWithTokenCharge(config, r.reply_phone, text, supabase, r.tenant_id, "bulk_campaign",
          "Disparo em massa: resposta automática (agendada)", r.contact_id);
        await supabase.from("campaign_contacts").update({ reply_status: res.success ? "sent" : "failed" }).eq("id", r.contact_id);
        if (r.reply_conversation_id) {
          await supabase.from("messages").insert({
            conversation_id: r.reply_conversation_id, tenant_id: r.tenant_id, sender_type: "bot", direction: "outbound",
            content: text, status: res.success ? "sent" : "failed",
          });
        }
        if (res.success) sent++; else failed++;
        log.info(`📣 Resposta agendada do disparo para ${r.reply_phone}: ${res.success ? "enviada" : "falhou"}`);
      }
    }
    return json({ success: true, sent, failed, campaigns_waiting_window: waiting });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("bulk-reply-scheduled", { error: String(err) });
    return json({ error: String(err) }, 500);
  }
});
