import type { WaCtx } from "./wa-webhook-types.ts";
import { sendReplyWithTokenCharge } from "./whatsapp-sender.ts";
import { replaceMessagePlaceholders } from "./wa-webhook-message-parser.ts";
import { RECEPTIONIST_CONFIG_COLUMNS } from "./select-columns.ts";

/** Handle phone number input from a LID contact that is awaiting phone capture.
 *  On valid phone: merges contacts if needed, dispatches welcome to real number.
 *  On invalid phone: asks again. */
export async function handleLidPhoneCapture(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, integration, contact, conversation, messageContent, phone, whatsAppConfig, instanceName, payload } = ctx;

  if (!conversation.awaiting_phone_input || !ctx.isLidContact) return null;

  log.info('📱 Processing phone number response for LID contact...');
  const phoneMatch = messageContent.replace(/\D/g, '');

  if (phoneMatch.length >= 10 && phoneMatch.length <= 13) {
    let realPhone = phoneMatch;
    if (!realPhone.startsWith('55')) realPhone = '55' + realPhone;
    log.info('✅ Valid phone number received:', realPhone);

    const { data: existingContactWithPhone } = await supabase
      .from('contacts').select('id, name, metadata')
      .eq('tenant_id', tenantId).eq('phone', realPhone).maybeSingle();

    if (existingContactWithPhone && existingContactWithPhone.id !== contact.id) {
      log.info('🔀 Contact merge: real phone already exists as contact', existingContactWithPhone.id);
      await supabase.from('conversations').update({ contact_id: existingContactWithPhone.id }).eq('id', conversation.id);
      if (contact.name && !existingContactWithPhone.name) {
        await supabase.from('contacts').update({ name: contact.name }).eq('id', existingContactWithPhone.id);
      }
      const realMeta = (existingContactWithPhone.metadata || {}) as Record<string, unknown>;
      await supabase.from('contacts').update({ metadata: { ...realMeta, lid_identifier: phone, phone_updated_from_lid: true } }).eq('id', existingContactWithPhone.id);
      await supabase.from('contacts').delete().eq('id', contact.id);
    } else {
      const existingMetadata = (contact.metadata || {}) as Record<string, unknown>;
      await supabase.from('contacts').update({
        phone: realPhone,
        metadata: { ...existingMetadata, lid_identifier: phone, phone_updated_from_lid: true, phone_collected_at: new Date().toISOString() },
      }).eq('id', contact.id);
    }

    await supabase.from('conversations').update({ awaiting_phone_input: false }).eq('id', conversation.id);

    log.info('🚀 Dispatching bot to real phone number:', realPhone);
    const dispatchInstance = (integration.metadata as { instanceName?: string })?.instanceName || instanceName;
    const evUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evKey = Deno.env.get('EVOLUTION_API_KEY')!;

    const [{ data: receptionistConfigForLid }, { data: aiAssistantConfigLid }] = await Promise.all([
      supabase.from('receptionist_configs').select(RECEPTIONIST_CONFIG_COLUMNS).eq('tenant_id', tenantId).eq('is_active', true).maybeSingle(),
      supabase.from('ai_assistant_configs').select('default_ai_agent_id').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    let inboxAgentData: { welcome_message?: string | null; interactive_buttons?: Array<{ text: string }> | null } | null = null;
    if (conversation.inbox_id) {
      const { data: inboxAgent } = await supabase.from('inboxes').select('ai_agent_id').eq('id', conversation.inbox_id).single();
      if (inboxAgent?.ai_agent_id) {
        const { data: agentData } = await supabase.from('ai_agents').select('welcome_message, interactive_buttons').eq('id', inboxAgent.ai_agent_id).single();
        inboxAgentData = agentData || null;
      }
    }

    const buildFullMenuText = (welcomeMsg: string, buttons: Array<{ text: string }>) => {
      if (!buttons || buttons.length === 0) return welcomeMsg;
      return `${welcomeMsg}\n\n${buttons.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n')}`;
    };

    let welcomeForRealPhone = `Olá! 👋 Como posso ajudar?`;
    if (inboxAgentData?.welcome_message) {
      const welcomeMsg = replaceMessagePlaceholders(inboxAgentData.welcome_message, contact.name || 'cliente');
      welcomeForRealPhone = buildFullMenuText(welcomeMsg, (inboxAgentData.interactive_buttons as Array<{ text: string }>) || []);
    } else if (receptionistConfigForLid) {
      const menuOptions = receptionistConfigForLid.menu_options as Array<{ id: string; label: string; action_type: string }>;
      const welcomeMsg = replaceMessagePlaceholders(receptionistConfigForLid.welcome_message, contact.name || 'cliente');
      welcomeForRealPhone = `${welcomeMsg}\n\n${menuOptions.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`;
    } else if (aiAssistantConfigLid?.default_ai_agent_id) {
      const { data: defaultAgent } = await supabase.from('ai_agents').select('welcome_message, interactive_buttons').eq('id', aiAssistantConfigLid.default_ai_agent_id).single();
      if (defaultAgent?.welcome_message) {
        const welcomeMsg = replaceMessagePlaceholders(defaultAgent.welcome_message, contact.name || 'cliente');
        welcomeForRealPhone = buildFullMenuText(welcomeMsg, (defaultAgent.interactive_buttons as Array<{ text: string }>) || []);
      }
    }

    try {
      const sendResp = await fetch(`${evUrl}/message/sendText/${dispatchInstance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evKey },
        body: JSON.stringify({ number: realPhone, text: welcomeForRealPhone }),
      });
      if (sendResp.ok) {
        const sendData = await sendResp.json();
        log.info(`✅ Welcome sent to real phone ${realPhone} via ${dispatchInstance}:`, sendData?.key?.id);
        await supabase.from('messages').insert({
          conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot',
          content: welcomeForRealPhone, direction: 'outbound', status: 'sent',
          provider_message_id: sendData?.key?.id || null,
        });
      } else {
        log.error(`❌ Failed to send welcome to real phone via ${dispatchInstance}:`, await sendResp.text());
      }
    } catch (evErr) {
      log.error('❌ Evolution API error dispatching to real phone:', evErr);
    }

    return new Response(JSON.stringify({ success: true, action: 'phone_collected_and_dispatched', real_phone: realPhone, conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Invalid phone format — ask again
  log.info('⚠️ Invalid phone format received:', messageContent);
  const retryMessage =
    `Hmm, não consegui identificar um número válido. 🤔\n\n` +
    `Por favor, envie seu número de WhatsApp com DDD (10 ou 11 dígitos).\n` +
    `Exemplo: 11999998888`;
  const retryResult = await sendReplyWithTokenCharge(
    whatsAppConfig, phone, retryMessage, payload.data.key.id,
    supabase, tenantId, 'receptionist', 'Recepcionista: retry solicitação telefone', conversation.id,
  );
  await supabase.from('messages').insert({ conversation_id: conversation.id, tenant_id: tenantId, sender_type: 'bot', content: retryMessage, status: retryResult.success ? 'sent' : 'failed' });

  return new Response(JSON.stringify({ success: true, action: 'retry_ask_phone', conversation_id: conversation.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
