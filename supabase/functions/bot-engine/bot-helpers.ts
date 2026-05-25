import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;

let _log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export function setLog(l: typeof _log) { _log = l; }

export async function transitionToHuman(supabase: ServiceClient, conversation: Record<string, unknown>, agent: Record<string, unknown>, tag?: string) {
  const updateData: Record<string, unknown> = {
    handoff_mode: true,
    ai_enabled: false,
    status: 'pending',
    bot_state_json: { stage: 'human', context: {} },
    bot_locked_until: null,
  };

  if (agent?.human_transfer_column_id) {
    updateData.kanban_column_id = agent.human_transfer_column_id;
  }

  await supabase.from('conversations').update(updateData).eq('id', conversation.id);

  await supabase.from('conversation_events').insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    type: 'handoff_on',
    payload_json: { trigger: 'bot_transfer', tag },
  });

  await supabase.from('messages').insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    sender_type: 'system',
    content: '🔔 Cliente solicitou atendimento humano',
    content_type: 'text',
    status: 'sent',
    direction: 'system',
    type: 'text',
  });

  await enqueueBotMessage(supabase, conversation, '👤 Transferindo para um atendente. Aguarde um momento...');

  if (tag) {
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('tenant_id', conversation.tenant_id)
      .eq('name', tag)
      .maybeSingle();

    let tagId = existingTag?.id;
    if (!tagId) {
      const { data: newTag } = await supabase
        .from('tags')
        .insert({ tenant_id: conversation.tenant_id, name: tag, color: '#3B82F6' })
        .select('id')
        .single();
      tagId = newTag?.id;
    }

    if (tagId) {
      await supabase.from('conversation_tags').upsert({
        conversation_id: conversation.id,
        tag_id: tagId,
      });
    }
  }
}

export async function enqueueBotMessage(supabase: ServiceClient, conversation: Record<string, unknown>, content: string) {
  const { data: hasTokens } = await supabase.rpc('has_enough_tokens', {
    _tenant_id: conversation.tenant_id,
    _amount: 1,
  });

  if (!hasTokens) {
    _log?.info('⚠️ No tokens for bot message');
    return;
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      sender_type: 'bot',
      content,
      content_type: 'text',
      status: 'queued',
      direction: 'outbound',
      type: 'text',
    })
    .select()
    .single();

  if (error) {
    _log?.error('❌ Error creating bot message:', error);
    return;
  }

  let channelId = conversation.channel_id;
  if (!channelId) {
    const { data: ch } = await supabase
      .from('whatsapp_channels')
      .select('id')
      .eq('tenant_id', conversation.tenant_id)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();
    channelId = ch?.id;
  }

  if (!channelId) {
    _log?.error('❌ No channel found for bot message');
    return;
  }

  const contact = conversation.contact;
  const phone = (contact as Record<string, unknown>)?.phone || '';

  await supabase.from('outbound_queue').insert({
    tenant_id: conversation.tenant_id,
    message_id: message.id,
    channel_id: channelId,
    to_phone_e164: phone,
    payload_json: { text: content },
    status: 'pending',
    next_retry_at: new Date().toISOString(),
  });

  await supabase.rpc('deduct_tokens', {
    _tenant_id: conversation.tenant_id,
    _amount: 1,
    _type: 'bot_message',
    _description: 'Mensagem do bot',
    _reference_id: message.id,
  });

  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
  }).eq('id', conversation.id);
}

export function triggerOutboundProcessing(log: typeof _log) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  fetch(`${supabaseUrl}/functions/v1/process-outbound-queue`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'bot-engine' }),
  }).then(() => {
    log?.info('📤 Triggered outbound queue processing');
  }).catch((err) => {
    log?.warn('⚠️ Failed to trigger outbound processing:', err);
  });
}
