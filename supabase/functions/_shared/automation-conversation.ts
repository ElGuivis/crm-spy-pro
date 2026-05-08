/**
 * Shared helper to create/find automation conversations.
 * When an automation (cashback, order notification, etc.) sends a WhatsApp message,
 * it should call this to create a conversation with source='automation'.
 * This prevents the bot from responding when the customer replies to an automation message.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

interface AutomationConversationParams {
  supabase: ReturnType<typeof createClient>;
  tenantId: string;
  customerPhone: string;
  integrationId: string;
  messageContent: string;
  automationType: string; // 'cashback', 'order_notification', 'birthday', etc.
  metadata?: Record<string, unknown>;
}

/**
 * Creates or finds an automation conversation for a customer.
 * If there's already an open automation conversation, reuses it.
 * The conversation is created with source='automation' and ai_enabled=false
 * so the bot-engine doesn't trigger when the customer replies.
 */
export async function ensureAutomationConversation({
  supabase,
  tenantId,
  customerPhone,
  integrationId,
  messageContent,
  automationType,
  metadata,
}: AutomationConversationParams): Promise<string | null> {
  try {
    // Normalize phone
    let normalizedPhone = customerPhone.replace(/\D/g, '');
    if (!normalizedPhone.startsWith('55') && normalizedPhone.length <= 11) {
      normalizedPhone = '55' + normalizedPhone;
    }

    // Find contact by phone
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (!contact) {
      // Create contact
      const { data: newContact, error: createErr } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenantId,
          phone: normalizedPhone,
          name: metadata?.customer_name || normalizedPhone,
        })
        .select('id')
        .single();

      if (createErr || !newContact) {
        console.error('[automation-conversation] Failed to create contact:', createErr);
        return null;
      }
      
      return await createConversation(supabase, tenantId, newContact.id, integrationId, messageContent, automationType, metadata);
    }

    // Check for existing open automation conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .eq('source', 'automation')
      .is('closed_at', null)
      .in('status', ['bot', 'open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConv) {
      // Update last_message_at and save outbound message
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', existingConv.id);

      await saveOutboundMessage(supabase, existingConv.id, tenantId, messageContent, automationType);
      return existingConv.id;
    }

    return await createConversation(supabase, tenantId, contact.id, integrationId, messageContent, automationType, metadata);
  } catch (err) {
    console.error('[automation-conversation] Error:', err);
    return null;
  }
}

async function createConversation(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  contactId: string,
  integrationId: string,
  messageContent: string,
  automationType: string,
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  // Resolve channel and inbox
  const { data: channel } = await supabase
    .from('whatsapp_channels')
    .select('id')
    .eq('integration_id', integrationId)
    .limit(1)
    .maybeSingle();

  let inboxId: string | null = null;
  if (channel) {
    const { data: inbox } = await supabase
      .from('inboxes')
      .select('id')
      .eq('channel_id', channel.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    inboxId = inbox?.id || null;
  }

  // Get default kanban column
  const { data: defaultCol } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default_for_new', true)
    .maybeSingle();

  let kanbanColumnId = defaultCol?.id || null;
  if (!kanbanColumnId) {
    const { data: firstCol } = await supabase
      .from('kanban_columns')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    kanbanColumnId = firstCol?.id || null;
  }

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      integration_id: integrationId,
      channel_id: channel?.id || null,
      inbox_id: inboxId,
      status: 'open',
      ai_enabled: false,       // Don't trigger bot
      handoff_mode: false,
      source: 'automation',    // Mark as automation conversation
      kanban_column_id: kanbanColumnId,
      bot_state_json: { stage: 'automation', context: { type: automationType } },
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (convErr || !conv) {
    console.error('[automation-conversation] Failed to create conversation:', convErr);
    return null;
  }

  // Save the outbound message
  await saveOutboundMessage(supabase, conv.id, tenantId, messageContent, automationType);

  return conv.id;
}

async function saveOutboundMessage(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  tenantId: string,
  content: string,
  automationType: string,
): Promise<void> {
  await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      sender_type: 'system',
      content,
      content_type: 'text',
      metadata: {
        automation_type: automationType,
        sent_by: 'automation',
      },
    });
}
