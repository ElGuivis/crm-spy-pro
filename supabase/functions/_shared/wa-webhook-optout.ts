// Descadastro pelo WhatsApp: o cliente manda só "SAIR" (ou PARAR/STOP/DESCADASTRAR) e para de receber mensagens automáticas.
// Grava em contact_blocks (source = 'optout'), que get_contact_blockers consulta em TODO envio de marketing/automação
// (_shared/contact-policy.ts) e o message-queue-processor confere antes de enviar o que já estava na fila.
// Conversas com o atendente/IA continuam funcionando e os avisos do próprio pedido continuam saindo (migration 20261121000002).
// Voltar a receber: o atendente remove o contato em Atendimentos → Descadastros ("voltar" já é palavra do menu do bot).
import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { brPhoneKey, brPhoneVariants } from "./br-phone.ts";

const OPTOUT_WORDS = new Set(["sair", "parar", "stop", "descadastrar", "nao quero receber", "nao quero mais receber"]);

export const OPTOUT_REPLY =
  "Pronto! ✅ Você não vai mais receber nossas mensagens automáticas.\n\nSe precisar de alguma coisa, é só chamar aqui que a gente te atende normalmente.";

/** Só a mensagem inteira conta ("sair", "SAIR!", "Sair 🙏"); "quero sair dessa dúvida" não descadastra. */
export function isOptoutMessage(text: string): boolean {
  const t = (text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return OPTOUT_WORDS.has(t);
}

/** Número real do cliente (contato LID sem número conhecido não tem como ser bloqueado por telefone). */
export function optoutPhone(ctx: Pick<WaCtx, "phone" | "realPhoneFromAlt" | "contact">): string | null {
  for (const c of [ctx.realPhoneFromAlt, ctx.contact?.phone, ctx.phone]) {
    if (!c || String(c).includes("@")) continue;
    const d = String(c).replace(/\D/g, "");
    if (d.length >= 12 && d.length <= 13) return brPhoneKey(d);
  }
  return null;
}

export async function handleOptout(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, contact, conversation, messageContent, phone, whatsAppConfig, buttonClickId, contactName } = ctx;
  if (buttonClickId || !isOptoutMessage(messageContent)) return null;

  const key = optoutPhone(ctx);
  if (!key) {
    log.warn("🚫 Pedido de SAIR sem número real (LID): segue o fluxo normal");
    return null;
  }

  // Bloqueio manual que já exista fica como está (não troca a origem).
  const { error } = await supabase.from("contact_blocks").upsert({
    tenant_id: tenantId,
    phone_e164: key,
    reason: "Pediu para sair pelo WhatsApp",
    source: "optout",
    contact_name: contact?.name || contactName || null,
    conversation_id: conversation?.id ?? null,
    message_text: messageContent.slice(0, 200),
  }, { onConflict: "tenant_id,phone_e164", ignoreDuplicates: true });
  if (error) {
    log.error("🚫 Não gravou o descadastro:", error.message);
    return null; // sem gravar, não confirma ao cliente
  }

  // O que já estava na fila para esse número não sai mais, menos os avisos do próprio pedido (pagamento, envio, entrega).
  const variants = brPhoneVariants(key);
  await supabase.from("message_queue").update({ status: "cancelled", last_error: "Contato pediu para sair (SAIR)" })
    .eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("status", "pending").in("recipient", variants)
    .or("reference_type.is.null,reference_type.neq.order_notification");

  const sent = await sendTextWithTokenCharge(whatsAppConfig, phone, OPTOUT_REPLY, supabase, tenantId, "receptionist", "Descadastro: confirmação de SAIR", conversation.id);
  await supabase.from("messages").insert({
    conversation_id: conversation.id, tenant_id: tenantId, sender_type: "bot", direction: "outbound",
    content: OPTOUT_REPLY, status: sent.success ? "sent" : "failed",
  });

  // Resposta a uma automação não precisa de atendente: encerra. Conversa normal continua como está.
  if (conversation.source === "automation") {
    await supabase.from("conversations").update({ status: "closed", ai_enabled: false, handoff_mode: false }).eq("id", conversation.id);
  }
  log.info(`🚫 Descadastro registrado para ${key}`);
  return new Response(JSON.stringify({ success: true, action: "whatsapp_optout", conversation_id: conversation.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
