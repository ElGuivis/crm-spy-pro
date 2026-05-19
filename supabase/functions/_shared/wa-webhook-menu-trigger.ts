import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { sendReceptionistMenu } from "./wa-webhook-receptionist-menu.ts";
import { RECEPTIONIST_CONFIG_COLUMNS } from "./select-columns.ts";

type MenuOption = { id: string; label: string; action_type: string; target_column_id?: string; response_message?: string };

/** Handle numeric menu selections and keyword triggers (e.g. "menu", "opções"). */
export async function handleMenuTrigger(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, contact, conversation, messageContent, phone, whatsAppConfig, buttonClickId, supabaseUrl, supabaseServiceKey, integration } = ctx;

  // Only relevant when no button was clicked (numeric/keyword path)
  if (buttonClickId) return null;

  const { data: receptionistConfig } = await supabase
    .from('receptionist_configs').select(RECEPTIONIST_CONFIG_COLUMNS)
    .eq('tenant_id', tenantId).eq('is_active', true).maybeSingle();
  if (!receptionistConfig) return null;

  const menuOptions = receptionistConfig.menu_options as MenuOption[];
  const messageLower = messageContent.toLowerCase().trim();
  const numericMatch = messageLower.match(/^(\d+)$/);

  if (numericMatch && menuOptions.length > 0) {
    const selectedNumber = parseInt(numericMatch[1], 10);
    if (selectedNumber >= 1 && selectedNumber <= menuOptions.length) {
      const selectedOption = menuOptions[selectedNumber - 1];
      log.info(`🔢 Numeric menu selection: ${selectedNumber} -> "${selectedOption.label}" (${selectedOption.action_type})`);

      if (selectedOption.action_type === 'transfer_to_human') {
        await supabase.from('conversations').update({
          status: 'pending', ai_enabled: false, current_ai_agent_id: null,
          ...(selectedOption.target_column_id && { kanban_column_id: selectedOption.target_column_id }),
        }).eq('id', conversation.id);
        const handoffMessage = receptionistConfig.human_handoff_message || 'Aguarde, um atendente irá te atender em breve.';
        const handoffResult = await sendTextWithTokenCharge(whatsAppConfig, phone, handoffMessage, supabase, tenantId, 'receptionist', 'Recepcionista: transferência para humano (numérico)', conversation.id);
        await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: handoffMessage, status: handoffResult.success ? 'sent' : 'failed' });
        return new Response(JSON.stringify({ success: true, action: 'receptionist_numeric_transfer_human', selected_option: selectedOption.label, conversation_id: conversation.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (selectedOption.action_type === 'transfer_to_column' && selectedOption.target_column_id) {
        await supabase.from('conversations').update({
          kanban_column_id: selectedOption.target_column_id, current_ai_agent_id: null,
          buffered_message_ids: [], verification_state: null, verification_data: null,
        }).eq('id', conversation.id);
        conversation.kanban_column_id = selectedOption.target_column_id;
        conversation.current_ai_agent_id = null;
        log.info('🤵 Numeric selection: moved to column:', selectedOption.target_column_id);
        try {
          await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ conversation_id: conversation.id, tenant_id: tenantId, contact_phone: phone, integration_id: integration.id, initialization_only: true }),
          });
        } catch (initError) {
          log.error('🤵 Error calling ai-chat for initialization:', initError);
        }
        return new Response(JSON.stringify({ success: true, action: 'receptionist_transfer_to_column', column_id: selectedOption.target_column_id, conversation_id: conversation.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (selectedOption.action_type === 'send_message' && selectedOption.response_message) {
        const msgResult = await sendTextWithTokenCharge(whatsAppConfig, phone, selectedOption.response_message, supabase, tenantId, 'receptionist', 'Recepcionista: resposta numérica', conversation.id);
        await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: selectedOption.response_message, status: msgResult.success ? 'sent' : 'failed' });
        return new Response(JSON.stringify({ success: true, action: 'receptionist_numeric_send_message', selected_option: selectedOption.label, conversation_id: conversation.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  const triggerKeywords = (receptionistConfig.menu_trigger_keywords as string[]) || ['menu', 'opções'];
  const shouldShowMenu = triggerKeywords.some(kw => messageLower === kw.toLowerCase());

  if (shouldShowMenu) {
    log.info('🤵 Menu trigger keyword detected, re-showing menu...');
    const { success: menuSent, menuText } = await sendReceptionistMenu({
      config: receptionistConfig, whatsAppConfig, phone, contactName: contact.name,
      supabase, tenantId, conversationId: conversation.id,
      tokenDescription: 'Recepcionista: menu re-exibido', skipWelcome: true,
    });
    await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: menuText, status: menuSent ? 'sent' : 'failed' });
    return new Response(JSON.stringify({ success: true, action: 'receptionist_menu_reshown', conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return null;
}
