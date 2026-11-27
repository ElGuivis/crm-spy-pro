// Resposta automática do disparo em massa.
// A 1ª mensagem do disparo vai SEM link (link de convite de grupo para quem não salvou o número é o que mais
// gera denúncia/restrição). Quem responder recebe `bulk_campaigns.reply_message` (com o link) uma única vez:
// conversa iniciada pelo cliente não pesa contra o número. Resposta negativa ("não") só registra.
// Roda depois do SAIR e antes do menu/bot. Reivindicação atômica em `claim_bulk_reply` (migration 20261125000002).
// Fora do horário da campanha (Brasília) a resposta fica 'scheduled' e sai pela função bulk-reply-scheduled
// quando a janela abrir (migration 20261127000001): nada de link às 4 h da manhã.
import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { optoutPhone } from "./wa-webhook-optout.ts";
import { renderBulkMessage } from "./spintax.ts";
import { humanPause, planReplyDelay } from "./bulk-reply-humanize.ts";
import { replyWindowOpen } from "./bulk-schedule.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const NEGATIVE = new Set([
  "nao", "n", "nao obrigado", "nao obrigada", "nao quero", "nao tenho interesse", "sem interesse",
  "nao precisa", "agora nao", "nao valeu", "nao obg", "dispenso",
]);

export function isNegativeReply(text: string): boolean {
  const t = (text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return NEGATIVE.has(t);
}

interface Claimed {
  contact_id: string; campaign_id: string; name: string | null; variables: Record<string, unknown> | null;
  reply_message: string; delay_min: number | null; delay_max: number | null;
}

export async function handleBulkReply(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, conversation, messageContent, phone, whatsAppConfig, buttonClickId, payload } = ctx;
  if (buttonClickId || !conversation) return null;
  const key = optoutPhone(ctx);
  if (!key) return null;

  const status = isNegativeReply(messageContent) ? "declined" : "sending";
  // Só vale resposta ao MESMO número que enviou o disparo, em até 24 h (migration 20261127000003).
  const { data, error } = await supabase.rpc("claim_bulk_reply", { _tenant_id: tenantId, _phone_key: key, _status: status, _integration_id: ctx.integration.id });
  if (error) { log.error("📣 claim_bulk_reply:", error.message); return null; }
  const row = (Array.isArray(data) ? data[0] : data) as Claimed | null;
  if (!row) {
    // Já tem resposta agendada (respondeu fora do horário e mandou mais mensagens): segura também, sem bot de madrugada.
    const { data: pending } = await supabase.from("campaign_contacts").select("id")
      .eq("tenant_id", tenantId).eq("reply_status", "scheduled").eq("reply_conversation_id", conversation.id).limit(1);
    if (pending?.length) {
      return new Response(JSON.stringify({ success: true, action: "bulk_reply_scheduled", conversation_id: conversation.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return null; // não respondeu a disparo com resposta automática
  }
  if (status === "declined") { log.info(`📣 ${key} recusou o disparo ${row.campaign_id}`); return null; }

  // De onde responder: usado pelo envio agendado E para reenviar se o runtime cair no meio da espera
  // (bulk-reply-scheduled pega 'sending' parado há 10+ min; migration 20261127000004).
  const replyTarget = { reply_integration_id: ctx.integration.id, reply_phone: phone, reply_conversation_id: conversation.id };
  const { data: camp } = await supabase.from("bulk_campaigns").select("sending_schedule, timezone").eq("id", row.campaign_id).maybeSingle();
  if (!replyWindowOpen(camp?.sending_schedule ?? null, camp?.timezone ?? null)) {
    await supabase.from("campaign_contacts").update({ reply_status: "scheduled", ...replyTarget }).eq("id", row.contact_id);
    log.info(`📣 ${key} respondeu fora do horário da campanha: resposta agendada para a abertura da janela`);
    return new Response(JSON.stringify({ success: true, action: "bulk_reply_scheduled", conversation_id: conversation.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("campaign_contacts").update(replyTarget).eq("id", row.contact_id);
  const text = renderBulkMessage(row.reply_message, row.name, row.variables);
  const plan = planReplyDelay(row.delay_min, row.delay_max, text.length);
  // Espera humana (lida → digitando → envia) em segundo plano: o webhook responde já.
  // Se o runtime cair no meio, a reserva 'sending' é reenviada pela bulk-reply-scheduled após 10 min.
  const task = (async () => {
    await humanPause(whatsAppConfig, phone, payload?.data?.key ?? null, plan, (m) => log.warn(`📣 ${m}`));
    const sent = await sendTextWithTokenCharge(whatsAppConfig, phone, text, supabase, tenantId, "bulk_campaign", "Disparo em massa: resposta automática", row.contact_id);
    await supabase.from("campaign_contacts").update({ reply_status: sent.success ? "sent" : "failed" }).eq("id", row.contact_id);
    await supabase.from("messages").insert({
      conversation_id: conversation.id, tenant_id: tenantId, sender_type: "bot", direction: "outbound",
      content: text, status: sent.success ? "sent" : "failed",
    });
    log.info(`📣 Resposta automática do disparo para ${key} após ${Math.round(plan.totalMs / 1000)}s: ${sent.success ? "enviada" : "falhou"}`);
  })().catch((e) => log.error("📣 Resposta automática falhou:", e));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
  else await task;
  return new Response(JSON.stringify({ success: true, action: "bulk_reply", conversation_id: conversation.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
