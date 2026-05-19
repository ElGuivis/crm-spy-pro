import { sendWhatsAppMessage, sendWhatsAppButtons, type InteractiveButton } from "./ai-chat-whatsapp.ts";
import { AI_AGENT_COLUMNS } from "./select-columns.ts";
import type { ChatRequest } from "./ai-chat-types.ts";

/** Process interactive button/list click events before normal AI processing.
 *  Returns a Response to exit early, or null to continue. */
export async function handleButtonClick(
  supabase: any,
  evolutionApiUrl: string,
  evolutionApiKey: string,
  payload: ChatRequest,
  corsHeaders: Record<string, string>,
  log: any,
): Promise<Response | null> {
  if (!payload.button_click_id) return null;

  log.info(`🔘 Processing button click: ${payload.button_click_id}`);

  const { data: conversationData } = await supabase
    .from('conversations')
    .select('current_ai_agent_id, kanban_column_id')
    .eq('id', payload.conversation_id)
    .eq('tenant_id', payload.tenant_id)
    .single();

  let currentAgentId = conversationData?.current_ai_agent_id;
  if (!currentAgentId && conversationData?.kanban_column_id) {
    const { data: assignment } = await supabase
      .from('ai_agent_column_assignments')
      .select('agent_id')
      .eq('column_id', conversationData.kanban_column_id)
      .eq('tenant_id', payload.tenant_id)
      .single();
    currentAgentId = assignment?.agent_id;
  }

  if (!currentAgentId) return null;

  const { data: currentAgent } = await supabase
    .from('ai_agents')
    .select('interactive_buttons, name')
    .eq('id', currentAgentId)
    .single();

  if (!currentAgent?.interactive_buttons) return null;

  const buttons = currentAgent.interactive_buttons as InteractiveButton[];
  const clickedButton = buttons.find(b => b.id === payload.button_click_id);
  if (!clickedButton) return null;

  log.info(`✅ Found clicked button: ${clickedButton.display_text} (${clickedButton.action_type})`);

  if (clickedButton.action_type === 'send_response' && clickedButton.response_message) {
    log.info('📤 Sending pre-programmed response');
    await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, clickedButton.response_message, supabase, payload.conversation_id);
    await supabase.from('messages').insert({ conversation_id: payload.conversation_id, tenant_id: payload.tenant_id, sender_type: 'bot', content: clickedButton.response_message, status: 'sent' });
    return new Response(JSON.stringify({ success: true, action: 'button_response', button_id: payload.button_click_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (clickedButton.action_type === 'transfer_to_human') {
    log.info('🔄 Transfer to human requested via button');
    const targetColumnId = clickedButton.target_column_id;
    await supabase.from('conversations').update({ status: 'pending', ai_enabled: false, current_ai_agent_id: null, ...(targetColumnId && { kanban_column_id: targetColumnId }) }).eq('id', payload.conversation_id);
    const transferMessage = 'Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor. 🙋';
    await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, transferMessage, supabase, payload.conversation_id);
    await supabase.from('messages').insert({ conversation_id: payload.conversation_id, tenant_id: payload.tenant_id, sender_type: 'bot', content: transferMessage, status: 'sent' });
    return new Response(JSON.stringify({ success: true, transferred: true, action: 'button_transfer_human' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (clickedButton.action_type === 'transfer_to_agent' && clickedButton.target_agent_id) {
    log.info(`🔄 Transfer to agent via button: ${clickedButton.target_agent_id}`);
    const { data: targetAgent } = await supabase.from('ai_agents').select(AI_AGENT_COLUMNS).eq('id', clickedButton.target_agent_id).eq('is_active', true).single();

    if (targetAgent) {
      await supabase.from('conversations').update({ current_ai_agent_id: targetAgent.id }).eq('id', payload.conversation_id);
      const transferMessage = `Entendi! Vou transferir você para ${targetAgent.name}. Um momento... 🔄`;
      await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, transferMessage, supabase, payload.conversation_id);
      await supabase.from('messages').insert({ conversation_id: payload.conversation_id, tenant_id: payload.tenant_id, sender_type: 'bot', content: transferMessage, status: 'sent' });

      if (targetAgent.welcome_message) {
        await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, targetAgent.welcome_message, supabase, payload.conversation_id);
        await supabase.from('messages').insert({ conversation_id: payload.conversation_id, tenant_id: payload.tenant_id, sender_type: 'bot', content: targetAgent.welcome_message, status: 'sent' });
      }

      if (targetAgent.interactive_buttons && (targetAgent.interactive_buttons as InteractiveButton[]).length > 0) {
        await sendWhatsAppButtons(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, targetAgent.name, 'Como posso ajudá-lo?', targetAgent.interactive_buttons as InteractiveButton[], supabase);
      }

      return new Response(JSON.stringify({ success: true, action: 'button_transfer_agent', new_agent_id: targetAgent.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
