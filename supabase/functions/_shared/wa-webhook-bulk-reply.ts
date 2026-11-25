// Resposta automática do disparo em massa.
// A 1ª mensagem do disparo vai SEM link (link de convite de grupo para quem não salvou o número é o que mais
// gera denúncia/restrição). Quem responder recebe `bulk_campaigns.reply_message` (com o link) uma única vez:
// conversa iniciada pelo cliente não pesa contra o número. Resposta negativa ("não") só registra.
// Roda depois do SAIR e antes do menu/bot. Reivindicação atômica em `claim_bulk_reply` (migration 20261125000002).
import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { optoutPhone } from "./wa-webhook-optout.ts";
import { renderBulkMessage } from "./spintax.ts";

const NEGATIVE = new Set([
  "nao", "n", "nao obrigado", "nao obrigada", "nao quero", "nao tenho interesse", "sem interesse",
  "nao precisa", "agora nao", "nao valeu", "nao obg", "dispenso",
]);

export function isNegativeReply(text: string): boolean {
  const t = (text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return NEGATIVE.has(t);
}

interface Claimed { contact_id: string; campaign_id: string; name: string | null; variables: Record<string, unknown> | null; reply_message: string }

export async function handleBulkReply(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, conversation, messageContent, phone, whatsAppConfig, buttonClickId } = ctx;
  if (buttonClickId || !conversation) return null;
  const key = optoutPhone(ctx);
  if (!key) return null;

  const status = isNegativeReply(messageContent) ? "declined" : "sending";
  const { data, error } = await supabase.rpc("claim_bulk_reply", { _tenant_id: tenantId, _phone_key: key, _status: status });
  if (error) { log.error("📣 claim_bulk_reply:", error.message); return null; }
  const row = (Array.isArray(data) ? data[0] : data) as Claimed | null;
  if (!row) return null; // não respondeu a disparo com resposta automática
  if (status === "declined") { log.info(`📣 ${key} recusou o disparo ${row.campaign_id}`); return null; }

  const text = renderBulkMessage(row.reply_message, row.name, row.variables);
  const sent = await sendTextWithTokenCharge(whatsAppConfig, phone, text, supabase, tenantId, "bulk_campaign", "Disparo em massa: resposta automática", row.contact_id);
  await supabase.from("campaign_contacts").update({ reply_status: sent.success ? "sent" : "failed" }).eq("id", row.contact_id);
  await supabase.from("messages").insert({
    conversation_id: conversation.id, tenant_id: tenantId, sender_type: "bot", direction: "outbound",
    content: text, status: sent.success ? "sent" : "failed",
  });
  log.info(`📣 Resposta automática do disparo para ${key}: ${sent.success ? "enviada" : "falhou"}`);
  return new Response(JSON.stringify({ success: true, action: "bulk_reply", conversation_id: conversation.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
