import type { WaCtx } from "./wa-webhook-types.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void } | undefined;

/** Automation guard + global menu intercept + AI/bot-engine routing.
 *  Returns null after handling (AI calls are fire-and-return, no early-exit needed). */
export async function routeToAI(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, corsHeaders, tenantId, contact, conversation, message, phone, messageContent, buttonClickId, contactName, supabaseUrl, supabaseServiceKey, integration } = ctx;

  // If conversation was created by an automation, skip bot entirely
  if (conversation.source === 'automation') {
    log.info('🤖 Automation conversation — skipping bot/AI response');
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    }).eq('id', conversation.id);
    return new Response(JSON.stringify({ success: true, action: 'automation_conversation_no_bot', conversation_id: conversation.id, message_id: message.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Global menu intercept: user typed a menu keyword while in handoff/AI-disabled mode
  const menuKeywords = ['menu', 'voltar', 'inicio', 'início', '0'];
  const lowerMsg = messageContent.toLowerCase().trim();
  const userWantsMenu = menuKeywords.includes(lowerMsg);

  if (userWantsMenu && (conversation.handoff_mode || !conversation.ai_enabled) && conversation.status !== 'closed') {
    log.info('📋 User typed menu keyword while in handoff/disabled — routing to bot-engine');
    let inboxBotEnabled = false;
    if (conversation.inbox_id) {
      const { data: inboxCheckMenu } = await supabase.from('inboxes').select('bot_enabled').eq('id', conversation.inbox_id).maybeSingle();
      inboxBotEnabled = inboxCheckMenu?.bot_enabled || false;
    }
    if (inboxBotEnabled) {
      try {
        const botMenuResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ conversation_id: conversation.id, message_id: message.id, message_content: messageContent, contact_name: contactName || contact.name || '', button_click_id: buttonClickId || null }),
        });
        log.info('📋 Bot-engine menu intercept result:', await botMenuResponse.json());
      } catch (botMenuErr) {
        log.error('❌ Bot-engine menu intercept error:', botMenuErr);
      }
    } else {
      log.info('📋 No bot-engine — resetting conversation to bot mode directly');
      await supabase.from('conversations').update({ handoff_mode: false, ai_enabled: true, status: 'bot', bot_state_json: { stage: 'menu', context: {} } }).eq('id', conversation.id);
    }
    return new Response(JSON.stringify({ success: true, action: 'menu_intercept_from_handoff', conversation_id: conversation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Skip AI if not in bot mode
  if (!conversation.ai_enabled || conversation.status !== 'bot') return null;

  const { data: aiConfig } = await supabase.from('ai_assistant_configs').select('is_active').eq('tenant_id', tenantId).maybeSingle();
  const globalAIEnabled = aiConfig?.is_active !== false;
  if (!globalAIEnabled) {
    log.info('⏸️ AI is globally disabled for this tenant, skipping');
    return null;
  }

  // Resolve current agent (may be missing if just transferred to a column)
  let currentAgentId = conversation.current_ai_agent_id;
  if (!currentAgentId && conversation.kanban_column_id) {
    log.info('📍 No current_ai_agent_id, looking up agent from column:', conversation.kanban_column_id);
    const { data: columnAssignment } = await supabase
      .from('ai_agent_column_assignments').select('agent_id')
      .eq('column_id', conversation.kanban_column_id)
      .order('priority', { ascending: true }).limit(1).maybeSingle();
    if (columnAssignment?.agent_id) {
      currentAgentId = columnAssignment.agent_id;
      log.info('📍 Found AI agent from column assignment:', currentAgentId);
      await supabase.from('conversations').update({ current_ai_agent_id: currentAgentId }).eq('id', conversation.id);
    }
  }

  let bufferEnabled = false;
  let bufferDelaySeconds = 3;
  if (currentAgentId) {
    const { data: currentAgent } = await supabase.from('ai_agents').select('message_buffer_enabled, message_buffer_delay_seconds').eq('id', currentAgentId).single();
    if (currentAgent) {
      bufferEnabled = currentAgent.message_buffer_enabled || false;
      // Clamp to [1,5] — reduces perceived latency without removing buffer entirely
      bufferDelaySeconds = Math.max(1, Math.min(currentAgent.message_buffer_delay_seconds ?? 3, 5));
      log.info(`📍 Agent buffer settings - enabled: ${bufferEnabled}, delay: ${bufferDelaySeconds}s`);
    }
  }

  if (bufferEnabled) {
    log.info(`⏳ Buffer mode active. Waiting ${bufferDelaySeconds}s for more messages...`);
    const { error: bufferError } = await supabase.rpc('add_message_to_buffer', {
      _conversation_id: conversation.id,
      _message_id: message.id,
      _delay_seconds: bufferDelaySeconds,
    });
    if (bufferError) log.error('❌ Error adding message to buffer:', bufferError);
    else log.info(`📝 Message buffered atomically. AI will respond in ${bufferDelaySeconds}s`);

    const scheduleBufferProcessing = async () => {
      await new Promise(resolve => setTimeout(resolve, bufferDelaySeconds * 1000));
      log.info(`⏰ Buffer delay elapsed for conversation ${conversation.id}, triggering processor...`);
      try {
        await fetch(`${supabaseUrl}/functions/v1/ai-buffer-processor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ triggered_by: 'webhook_waitUntil', conversation_id: conversation.id }),
        });
      } catch (e) {
        log.error('❌ Error calling buffer processor:', e);
      }
    };

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(scheduleBufferProcessing());
      log.info(`🚀 Scheduled buffer processing in ${bufferDelaySeconds}s via waitUntil`);
    } else {
      log.info(`📋 waitUntil not available, relying on cron job`);
    }
    return null;
  }

  // Normal mode: route through bot-engine first if enabled, then ai-chat
  let shouldCallAI = true;
  if (conversation.inbox_id) {
    const { data: inboxCheck } = await supabase.from('inboxes').select('bot_enabled').eq('id', conversation.inbox_id).maybeSingle();
    if (inboxCheck?.bot_enabled) {
      log.info('🤖 Bot enabled on inbox, calling bot-engine first...');
      try {
        const botResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ conversation_id: conversation.id, message_id: message.id, message_content: messageContent, contact_name: contactName || contact.name || '', button_click_id: buttonClickId || null }),
        });
        const botResult = await botResponse.json();
        log.info('🤖 Bot-engine result:', botResult);
        shouldCallAI = botResult.action === 'delegate_to_ai';
        if (!shouldCallAI) log.info('🤖 Bot-engine handled it, skipping ai-chat');
      } catch (botErr) {
        log.error('❌ Bot-engine error, falling back to ai-chat:', botErr);
      }
    }
  }

  if (shouldCallAI) {
    log.info('🤖 Triggering AI response...');
    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ conversation_id: conversation.id, message_id: message.id, tenant_id: tenantId, contact_phone: phone, integration_id: integration.id, button_click_id: buttonClickId || null }),
    });
    log.info('🤖 AI response result:', await aiResponse.json());
  }

  return null;
}
