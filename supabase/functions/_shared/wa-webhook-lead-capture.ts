import type { WaCtx } from "./wa-webhook-types.ts";
import { sendTextWithTokenCharge } from "./whatsapp-sender.ts";
import { sendReceptionistMenu } from "./wa-webhook-receptionist-menu.ts";
import { RECEPTIONIST_CONFIG_COLUMNS } from "./select-columns.ts";

/** Handle multi-step lead capture state machine (awaiting_name → awaiting_phone → completed). */
export async function handleLeadCapture(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, integration, contact, conversation, messageContent, phone, whatsAppConfig } = ctx;

  if (!conversation.lead_capture_state || conversation.lead_capture_state === 'completed') return null;

  log.info('📝 Processing lead capture response, state:', conversation.lead_capture_state);
  const leadCaptureData = (conversation.lead_capture_data || {}) as Record<string, unknown>;

  const { data: receptionistConfig } = await supabase
    .from('receptionist_configs').select(RECEPTIONIST_CONFIG_COLUMNS)
    .eq('tenant_id', tenantId).maybeSingle();

  if (conversation.lead_capture_state === 'awaiting_name') {
    const userName = messageContent.trim();
    log.info('📝 Captured name:', userName);
    leadCaptureData.name = userName;

    await supabase.from('conversations').update({ lead_capture_state: 'awaiting_phone', lead_capture_data: leadCaptureData }).eq('id', conversation.id);
    await supabase.from('contacts').update({ name: userName }).eq('id', contact.id);

    const phoneMessage = (receptionistConfig?.lead_capture_phone_message || 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:').replace(/{nome}/g, userName);
    const phoneResult = await sendTextWithTokenCharge(whatsAppConfig, phone, phoneMessage, supabase, tenantId, 'receptionist', 'Recepcionista: captura de lead - telefone', conversation.id);
    await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: phoneMessage, status: phoneResult.success ? 'sent' : 'failed' });

    return new Response(JSON.stringify({ success: true, action: 'lead_capture_ask_phone', name: userName, conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (conversation.lead_capture_state === 'awaiting_phone') {
    const userPhone = messageContent.replace(/\D/g, '');

    if (userPhone.length >= 10 && userPhone.length <= 13) {
      let normalizedPhone = userPhone;
      if (!normalizedPhone.startsWith('55')) normalizedPhone = '55' + normalizedPhone;
      log.info('📝 Captured phone:', normalizedPhone);

      leadCaptureData.phone = normalizedPhone;
      const userName = (leadCaptureData.name as string) || 'Cliente';

      await supabase.from('conversations').update({
        lead_capture_state: 'completed',
        lead_capture_data: leadCaptureData,
        ...(receptionistConfig?.target_column_id && { kanban_column_id: receptionistConfig.target_column_id }),
      }).eq('id', conversation.id);

      await supabase.from('leads').insert({
        tenant_id: tenantId, contact_id: contact.id, conversation_id: conversation.id,
        integration_id: integration.id, name: userName, phone: normalizedPhone, source: 'receptionist',
        metadata: { original_message: messageContent, captured_at: new Date().toISOString() },
      });
      log.info('📝 Lead created successfully');

      const successMessage = (receptionistConfig?.lead_capture_success_message || 'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...').replace(/{nome}/g, userName);
      const successResult = await sendTextWithTokenCharge(whatsAppConfig, phone, successMessage, supabase, tenantId, 'receptionist', 'Recepcionista: captura de lead - sucesso', conversation.id);
      await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: successMessage, status: successResult.success ? 'sent' : 'failed' });

      if (receptionistConfig?.is_active) {
        const { success: menuSent, menuText } = await sendReceptionistMenu({
          config: receptionistConfig, whatsAppConfig, phone, contactName: contact.name,
          supabase, tenantId, conversationId: conversation.id,
          tokenDescription: 'Recepcionista: menu após captura de lead', skipWelcome: true,
        });
        await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: menuText, status: menuSent ? 'sent' : 'failed' });
      }

      return new Response(JSON.stringify({ success: true, action: 'lead_capture_completed', lead: { name: userName, phone: normalizedPhone }, conversation_id: conversation.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Invalid phone format — ask again
    log.info('⚠️ Invalid phone format in lead capture:', messageContent);
    const retryMessage = 'Não consegui identificar um número válido. Por favor, envie seu telefone com DDD (ex: 11999998888):';
    const retryResult = await sendTextWithTokenCharge(whatsAppConfig, phone, retryMessage, supabase, tenantId, 'receptionist', 'Recepcionista: captura de lead - retry telefone', conversation.id);
    await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: retryMessage, status: retryResult.success ? 'sent' : 'failed' });

    return new Response(JSON.stringify({ success: true, action: 'lead_capture_retry_phone', conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return null;
}
