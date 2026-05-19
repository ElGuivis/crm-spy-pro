import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { sendReceptionistMenu } from "./wa-webhook-receptionist-menu.ts";
import { replaceMessagePlaceholders } from "./wa-webhook-message-parser.ts";
import { RECEPTIONIST_CONFIG_COLUMNS } from "./select-columns.ts";

type MenuOption = { id: string; label: string; action_type: string; target_column_id?: string; response_message?: string };

async function executeReceptionistAction(
  ctx: WaCtx,
  selectedOption: MenuOption,
  receptionistConfig: any,
  logPrefix: string,
): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, contact, conversation, phone, whatsAppConfig, supabaseUrl, supabaseServiceKey, integration } = ctx;

  if (selectedOption.action_type === 'transfer_to_human') {
    await supabase.from('conversations').update({
      status: 'pending', ai_enabled: false, current_ai_agent_id: null,
      ...(selectedOption.target_column_id && { kanban_column_id: selectedOption.target_column_id }),
    }).eq('id', conversation.id);
    const handoffMessage = receptionistConfig.human_handoff_message || 'Aguarde, um atendente irá te atender em breve.';
    const handoffResult = await sendTextWithTokenCharge(whatsAppConfig, phone, handoffMessage, supabase, tenantId, 'receptionist', `${logPrefix}: transferência para humano`, conversation.id);
    await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: handoffMessage, status: handoffResult.success ? 'sent' : 'failed' });
    return new Response(JSON.stringify({ success: true, action: 'receptionist_transfer_human', conversation_id: conversation.id }), {
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
    log.info(`${logPrefix}: moved to column:`, selectedOption.target_column_id);
    try {
      await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ conversation_id: conversation.id, tenant_id: tenantId, contact_phone: phone, integration_id: integration.id, initialization_only: true }),
      });
    } catch (initError) {
      log.error(`${logPrefix}: Error calling ai-chat for initialization:`, initError);
    }
    return new Response(JSON.stringify({ success: true, action: 'receptionist_transfer_to_column', column_id: selectedOption.target_column_id, conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (selectedOption.action_type === 'send_message' && selectedOption.response_message) {
    const msgResult = await sendTextWithTokenCharge(whatsAppConfig, phone, selectedOption.response_message, supabase, tenantId, 'receptionist', `${logPrefix}: resposta de opção do menu`, conversation.id);
    await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: selectedOption.response_message, status: msgResult.success ? 'sent' : 'failed' });
    return new Response(JSON.stringify({ success: true, action: 'receptionist_send_message', conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return null;
}

/** Handle receptionist flow for brand-new conversations: LID guard, lead capture, welcome + menu. */
export async function handleNewConversationReceptionist(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, contact, conversation, message, phone, whatsAppConfig, isLidContact, isNewConversation } = ctx;

  if (!isNewConversation) return null;

  const contactMetadata = (contact.metadata || {}) as Record<string, unknown>;
  const hasRealPhone = !!contactMetadata.real_phone;

  if (isLidContact && !hasRealPhone) {
    log.info('📱 New LID contact without real_phone, silently awaiting phone number...');
    await supabase.from('conversations').update({ awaiting_phone_input: true }).eq('id', conversation.id);
    return new Response(JSON.stringify({ success: true, action: 'awaiting_phone_silently', conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (isLidContact && hasRealPhone) {
    log.info('📱 LID contact already has real_phone, skipping phone request');
  }

  const { data: receptionistConfig } = await supabase.from('receptionist_configs').select(RECEPTIONIST_CONFIG_COLUMNS).eq('tenant_id', tenantId).eq('is_active', true).maybeSingle();
  if (!receptionistConfig) return null;

  log.info('🤵 Receptionist active');

  if (receptionistConfig.lead_capture_enabled) {
    const { data: existingLead } = await supabase.from('leads').select('id, name, phone').eq('tenant_id', tenantId).eq('contact_id', contact.id).maybeSingle();
    const leadAlreadyCaptured = existingLead && existingLead.name;
    const captureAlreadyCompleted = conversation.lead_capture_state === 'completed';

    if (!leadAlreadyCaptured && !captureAlreadyCompleted) {
      log.info('📝 Lead capture enabled, starting capture flow...');
      await supabase.from('conversations').update({ lead_capture_state: 'awaiting_name', lead_capture_data: {} }).eq('id', conversation.id);
      const nameMessage = receptionistConfig.lead_capture_name_message || 'Para um melhor atendimento, qual é o seu nome? 😊';
      const nameResult = await sendTextWithTokenCharge(whatsAppConfig, phone, nameMessage, supabase, tenantId, 'receptionist', 'Recepcionista: captura de lead - nome', conversation.id);
      await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: nameMessage, status: nameResult.success ? 'sent' : 'failed' });
      return new Response(JSON.stringify({ success: true, action: 'lead_capture_ask_name', conversation_id: conversation.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log.info('📝 Lead already captured, skipping lead capture flow');
  }

  log.info('🤵 Sending welcome message + menu...');
  const welcomeMsg = replaceMessagePlaceholders(receptionistConfig.welcome_message, contact.name);
  const welcomeResult = await sendTextWithTokenCharge(whatsAppConfig, phone, welcomeMsg, supabase, tenantId, 'receptionist', 'Recepcionista: boas-vindas', conversation.id);
  await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: welcomeMsg, status: welcomeResult.success ? 'sent' : 'failed' });

  const { success: menuSent, menuText } = await sendReceptionistMenu({
    config: receptionistConfig, whatsAppConfig, phone, contactName: contact.name,
    supabase, tenantId, conversationId: conversation.id,
    tokenDescription: 'Recepcionista: menu', skipWelcome: true,
  });
  await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: menuText, status: menuSent ? 'sent' : 'failed' });

  return new Response(JSON.stringify({ success: true, contact_id: contact.id, conversation_id: conversation.id, message_id: message.id, receptionist: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Handle receptionist button/list click events (buttonClickId starts with 'receptionist_'). */
export async function handleReceptionistButtonClick(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, tenantId, buttonClickId } = ctx;

  if (!buttonClickId || !buttonClickId.startsWith('receptionist_')) return null;

  log.info('🤵 Receptionist menu option selected:', buttonClickId);

  const { data: receptionistConfig } = await supabase.from('receptionist_configs').select(RECEPTIONIST_CONFIG_COLUMNS).eq('tenant_id', tenantId).maybeSingle();
  if (!receptionistConfig) return null;

  const optionId = buttonClickId.replace('receptionist_', '');
  const menuOptions = receptionistConfig.menu_options as MenuOption[];
  const selectedOption = menuOptions.find(opt => opt.id === optionId);
  if (!selectedOption) return null;

  return executeReceptionistAction(ctx, selectedOption, receptionistConfig, 'Recepcionista');
}
