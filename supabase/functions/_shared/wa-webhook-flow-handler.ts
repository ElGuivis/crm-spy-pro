import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";

interface FlowSession {
  currentNodeId: string | null;
  pendingNodeId: string | null;
  waitingForInput: boolean;
  variables: Record<string, string>;
}

interface FlowRunnerResult {
  messages: string[];
  session: FlowSession;
  done: boolean;
  transferToHuman: boolean;
  error?: string;
}

interface FlowRow {
  id: string;
  trigger_keywords: string[] | null;
}

interface ActiveSessionRow {
  id: string;
  flow_id: string;
  session: FlowSession;
}

/**
 * Chatbot Flow handler. Roda antes do menu/AI:
 *  1. Se a conversa tem sessão ativa (chatbot_flow_sessions.is_active=true), continua o flow com messageContent como input.
 *  2. Caso contrário, procura um flow ativo+publicado cujo trigger_keywords contenha o texto (exact match, case-insensitive).
 *  3. Se nenhum dos dois, retorna null → pipeline continua para handleMenuTrigger / routeToAI.
 */
export async function handleChatbotFlow(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, conversation, messageContent, phone, whatsAppConfig, supabaseUrl, supabaseServiceKey } = ctx;

  if (!messageContent) return null;

  // 1. Sessão ativa? (sempre tem prioridade — não perder estado do flow)
  const { data: activeSession } = await supabase
    .from("chatbot_flow_sessions")
    .select("id, flow_id, session, updated_at")
    .eq("conversation_id", conversation.id)
    .eq("is_active", true)
    .maybeSingle();

  // Saida da sessao: o cliente digitou menu/sair/cancelar ou abandonou o flow ha mais de 12 h.
  // Antes a sessao ficava presa e engolia toda mensagem seguinte da conversa.
  if (activeSession) {
    const lowerInput = messageContent.toLowerCase().trim();
    const stale = Date.now() - new Date((activeSession as { updated_at?: string }).updated_at ?? Date.now()).getTime() > 12 * 3600 * 1000;
    if (stale || ["menu", "sair", "cancelar", "voltar", "inicio", "início", "0"].includes(lowerInput)) {
      await supabase.from("chatbot_flow_sessions").update({ is_active: false, completed_at: new Date().toISOString() }).eq("id", (activeSession as { id: string }).id);
      log.info(`🤖 Sessão de flow encerrada (${stale ? "inativa" : "cliente pediu para sair"})`);
      return null;
    }
  }

  let flowId: string;
  let inputSession: FlowSession | null;
  let userInput: string | null;
  let activeSessionId: string | null = null;

  if (activeSession) {
    const row = activeSession as unknown as ActiveSessionRow;
    flowId = row.flow_id;
    inputSession = row.session;
    userInput = messageContent;
    activeSessionId = row.id;
    log.info(`🤖 Continuando flow ativo ${flowId} na conversa ${conversation.id}`);
  } else {
    // 2. Keyword match
    const lower = messageContent.toLowerCase().trim();
    const { data: flows } = await supabase
      .from("chatbot_flows")
      .select("id, trigger_keywords")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("is_published", true);

    const matched = ((flows || []) as unknown as FlowRow[]).find((f) =>
      (f.trigger_keywords || []).some((kw) => kw.toLowerCase().trim() === lower)
    );

    if (!matched) return null;

    flowId = matched.id;
    inputSession = null;
    userInput = null;
    log.info(`🤖 Disparando novo flow ${flowId} (keyword: "${lower}") na conversa ${conversation.id}`);
  }

  // 3. Invocar flow-runner
  const resp = await fetch(`${supabaseUrl}/functions/v1/flow-runner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({ flowId, session: inputSession, userInput }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    log.error(`❌ flow-runner falhou (${resp.status}):`, errText);
    return null;
  }

  const result = (await resp.json()) as FlowRunnerResult;

  // 4. Enviar mensagens do flow via WhatsApp
  for (const msg of result.messages || []) {
    const text = (msg || "").trim();
    if (!text) continue;
    const sendResult = await sendTextWithTokenCharge(
      whatsAppConfig, phone, text, supabase, tenantId,
      "chatbot_flow", `Chatbot flow ${flowId}`, conversation.id
    );
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      tenant_id: tenantId,
      sender_type: "bot",
      direction: "outbound",
      content: text,
      status: sendResult.success ? "sent" : "failed",
    });
    if (!sendResult.success) {
      log.warn(`⚠️ Falha ao enviar mensagem do flow:`, sendResult.error);
    }
  }

  // 5. Atualizar/fechar sessão
  const shouldClose = result.done || result.transferToHuman;
  const nowIso = new Date().toISOString();

  if (activeSessionId) {
    await supabase.from("chatbot_flow_sessions").update({
      session: result.session,
      updated_at: nowIso,
      ...(shouldClose && { is_active: false, completed_at: nowIso }),
    }).eq("id", activeSessionId);
  } else if (!shouldClose) {
    // Nova sessão (só se o flow não terminou de cara)
    const { error: insErr } = await supabase.from("chatbot_flow_sessions").insert({
      tenant_id: tenantId,
      conversation_id: conversation.id,
      flow_id: flowId,
      session: result.session,
      is_active: true,
    });
    if (insErr) log.warn(`⚠️ Erro ao criar sessão do flow:`, insErr);
  }

  // 6. Handoff: marca a conversa pra atendimento humano
  if (result.transferToHuman) {
    await supabase.from("conversations").update({
      status: "pending",
      ai_enabled: false,
      handoff_mode: true,
    }).eq("id", conversation.id);
    log.info(`🤵 Flow ${flowId} transferiu para humano`);
  }

  return new Response(JSON.stringify({
    success: true,
    action: "chatbot_flow",
    flow_id: flowId,
    done: result.done,
    transfer_to_human: result.transferToHuman,
    conversation_id: conversation.id,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
