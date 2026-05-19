import type { WaCtx } from "./wa-webhook-types.ts";
import { CONVERSATION_COLUMNS } from "./select-columns.ts";

/** Find or create conversation + inbox guard, then atomically INSERT the message.
 *  Mutates ctx.conversation, ctx.message, ctx.isNewConversation. */
export async function findOrCreateConversation(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, integration, contact, messageContent, contentType, mediaUrl, payload, instanceName } = ctx;

  let { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('contact_id', contact.id)
    .is('closed_at', null)
    .in('status', ['bot', 'open', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let isNewConversation = false;

  if (conversationError && conversationError.code === 'PGRST116') {
    isNewConversation = true;

    const { data: defaultColumn } = await supabase.from('kanban_columns').select('id').eq('tenant_id', tenantId).eq('is_default_for_new', true).maybeSingle();
    let kanbanColumnId = defaultColumn?.id || null;
    if (!kanbanColumnId) {
      const { data: firstColumn } = await supabase.from('kanban_columns').select('id').eq('tenant_id', tenantId).order('position', { ascending: true }).limit(1).maybeSingle();
      kanbanColumnId = firstColumn?.id || null;
    }

    let defaultAiAgentId: string | null = null;
    let startOrderVerificationFlow = false;
    const { data: aiAssistantConfig } = await supabase.from('ai_assistant_configs').select('default_ai_agent_id').eq('tenant_id', tenantId).maybeSingle();
    if (aiAssistantConfig?.default_ai_agent_id) {
      defaultAiAgentId = aiAssistantConfig.default_ai_agent_id;
      log.info('🤖 Using default AI agent:', defaultAiAgentId);
      const { data: defaultAgent } = await supabase.from('ai_agents').select('data_access').eq('id', defaultAiAgentId).single();
      if (defaultAgent?.data_access) {
        const da = defaultAgent.data_access as { orders?: boolean; smart_search?: boolean };
        if (da.orders && da.smart_search) {
          startOrderVerificationFlow = true;
          log.info('🔐 Default agent has order verification - will start verification flow');
        }
      }
    }

    let resolvedChannelId: string | null = null;
    let resolvedInboxId: string | null = null;
    const { data: whatsappChannel } = await supabase.from('whatsapp_channels').select('id').eq('integration_id', integration.id).limit(1).maybeSingle();
    if (whatsappChannel) {
      resolvedChannelId = whatsappChannel.id;
      const { data: linkedInbox } = await supabase.from('inboxes').select('id').eq('channel_id', whatsappChannel.id).eq('is_active', true).limit(1).maybeSingle();
      resolvedInboxId = linkedInbox?.id || null;
    }
    log.info(`🔗 Resolved channel_id=${resolvedChannelId}, inbox_id=${resolvedInboxId}`);

    if (!resolvedInboxId) {
      log.info(`⏭️ Skipping: Integration "${instanceName}" has no inbox configured.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_inbox_configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        integration_id: integration.id,
        channel_id: resolvedChannelId,
        inbox_id: resolvedInboxId,
        status: 'bot',
        ai_enabled: true,
        bot_state_json: { stage: 'welcome', context: {} },
        kanban_column_id: kanbanColumnId,
        current_ai_agent_id: defaultAiAgentId,
        verification_state: startOrderVerificationFlow ? 'awaiting_order_number' : null,
      })
      .select()
      .single();

    if (createError) {
      log.error('❌ Error creating conversation:', createError);
      throw createError;
    }
    conversation = newConversation;
    log.info('💬 New conversation created:', conversation.id, startOrderVerificationFlow ? '(with order verification)' : '');
  } else if (conversationError) {
    throw conversationError;
  }

  // Guard: existing conversation missing inbox_id (created before inbox was configured)
  if (!conversation.inbox_id) {
    const { data: whatsappChannelEx } = await supabase.from('whatsapp_channels').select('id').eq('integration_id', integration.id).limit(1).maybeSingle();
    if (whatsappChannelEx) {
      const { data: linkedInboxEx } = await supabase.from('inboxes').select('id').eq('channel_id', whatsappChannelEx.id).eq('is_active', true).limit(1).maybeSingle();
      if (linkedInboxEx) {
        await supabase.from('conversations').update({ channel_id: whatsappChannelEx.id, inbox_id: linkedInboxEx.id }).eq('id', conversation.id);
        conversation.inbox_id = linkedInboxEx.id;
        conversation.channel_id = whatsappChannelEx.id;
        log.info(`✅ Conversation ${conversation.id} updated with inbox ${linkedInboxEx.id}`);
      } else {
        log.info(`⏭️ Skipping: Existing conversation has no inbox for "${instanceName}".`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_inbox_configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      log.info(`⏭️ Skipping: No whatsapp channel for "${instanceName}".`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_channel_configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Atomic dedup: INSERT-first to reject concurrent duplicates via unique partial index
  const whatsappMessageId = payload.data.key.id;
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      tenant_id: tenantId,
      sender_type: 'contact',
      sender_id: contact.id,
      content: messageContent,
      content_type: contentType,
      media_url: mediaUrl || null,
      provider_message_id: whatsappMessageId || null,
      metadata: { whatsapp_message_id: whatsappMessageId, timestamp: payload.data.messageTimestamp },
    })
    .select()
    .single();

  if (messageError) {
    if (messageError.code === '23505') {
      log.info('⏭️ Dedup (atomic): message already being processed, skipping:', whatsappMessageId);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    log.error('❌ Error saving message:', messageError);
    throw messageError;
  }

  log.info('💾 Message saved:', message.id);

  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
    last_incoming_message_id: payload.data.key.id,
  }).eq('id', conversation.id);

  ctx.conversation = conversation;
  ctx.message = message;
  ctx.isNewConversation = isNewConversation;
  return null;
}
