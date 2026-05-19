import { sendWhatsAppMessage, sendWhatsAppButtons, type InteractiveButton } from "./ai-chat-whatsapp.ts";
import { AI_AGENT_COLUMNS } from "./select-columns.ts";
import type { AgentTransferRule, KeywordActionRule } from "./ai-chat-types.ts";

interface AgentTransferOpts {
  supabase: any;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  conversationId: string;
  tenantId: string;
  integrationId: string;
  contactPhone: string;
  messageText: string;
  aiAgent: any;
  aiConfig: any;
  corsHeaders: Record<string, string>;
  log: any;
}

export interface AgentTransferResult {
  updatedAgent: any | null;
  response: Response | null;
}

/** Check agent-to-agent transfer rules, keyword action rules, and human transfer keywords.
 *  updatedAgent is set if the active agent was switched (processing continues with new agent).
 *  response is set if processing should stop and return immediately. */
export async function handleAgentTransfer(opts: AgentTransferOpts): Promise<AgentTransferResult> {
  const { supabase, evolutionApiUrl, evolutionApiKey, conversationId, tenantId, integrationId, contactPhone, messageText, aiAgent, aiConfig, corsHeaders, log } = opts;

  // ── Agent-to-agent transfer rules ────────────────────────────────
  const agentTransferRules: AgentTransferRule[] = aiAgent?.agent_transfer_rules || [];
  let updatedAgent = null;

  for (const rule of agentTransferRules) {
    const matches = rule.keywords.some(kw => messageText.includes(kw.toLowerCase()));
    if (!matches || !rule.target_agent_id) continue;

    const { data: targetAgent } = await supabase.from('ai_agents').select(AI_AGENT_COLUMNS).eq('id', rule.target_agent_id).eq('is_active', true).single();
    if (!targetAgent) continue;

    log.info(`🔄 Transfer "${aiAgent?.name}" → "${targetAgent.name}"`);
    await supabase.from('conversations').update({ current_ai_agent_id: targetAgent.id }).eq('id', conversationId);

    const transferMsg = `Entendi! Vou transferir você para ${targetAgent.name}. Um momento... 🔄`;
    await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, transferMsg, supabase);
    await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: transferMsg, status: 'sent' });

    if (targetAgent.welcome_message) {
      await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, targetAgent.welcome_message, supabase);
      await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: targetAgent.welcome_message, status: 'sent' });
    }

    updatedAgent = targetAgent;
    break;
  }

  const activeAgent = updatedAgent || aiAgent;

  // ── Keyword action rules ──────────────────────────────────────────
  const keywordActionRules: KeywordActionRule[] = activeAgent?.keyword_action_rules || [];

  for (const rule of keywordActionRules) {
    const matches = rule.keywords.some(kw => messageText.includes(kw.toLowerCase()));
    if (!matches) continue;

    log.info(`⚡ Keyword action: ${rule.action_type} for [${rule.keywords.join(', ')}]`);
    let responseSent = false;

    if ((rule.action_type === 'send_response' || rule.action_type === 'send_and_move') && rule.response_message) {
      await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, rule.response_message, supabase);
      await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: rule.response_message, status: 'sent' });
      responseSent = true;
    }

    if ((rule.action_type === 'move_column' || rule.action_type === 'send_and_move') && rule.target_column_id) {
      await supabase.from('conversations').update({ kanban_column_id: rule.target_column_id }).eq('id', conversationId);
    }

    if (responseSent) {
      return { updatedAgent, response: new Response(JSON.stringify({ success: true, action: 'keyword_action_rule', rule_type: rule.action_type }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
    }
    break;
  }

  // ── Transfer to human keywords ────────────────────────────────────
  const transferKeywords: string[] = activeAgent?.transfer_keywords || aiConfig?.transfer_keywords || ['atendente', 'humano', 'pessoa'];
  const shouldTransfer = transferKeywords.some((kw: string) => messageText.includes(kw.toLowerCase()));

  if (shouldTransfer) {
    log.info('🔄 Transfer to human via keywords');
    const targetColumnId = activeAgent?.human_transfer_column_id;
    await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, current_ai_agent_id: null, ...(targetColumnId && { kanban_column_id: targetColumnId }) }).eq('id', conversationId);
    const transferMsg = 'Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor. 🙋';
    await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, transferMsg, supabase);
    await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: transferMsg, status: 'sent' });
    return { updatedAgent, response: new Response(JSON.stringify({ success: true, transferred: true, message: transferMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }

  return { updatedAgent, response: null };
}
