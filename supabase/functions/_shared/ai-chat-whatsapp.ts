/**
 * WhatsApp Message Sending Helpers for AI Chat
 * Handles Evolution API integration including LID contact resolution.
 * Extracted from ai-chat/index.ts for maintainability.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("ai-chat-whatsapp", "shared");


export interface InteractiveButton {
  id: string;
  display_text: string;
  action_type: 'transfer_to_agent' | 'send_response' | 'transfer_to_human';
  target_agent_id?: string;
  response_message?: string;
  target_column_id?: string;
}

/** Resolve the Evolution API instance name for an integration */
async function getInstanceName(supabase: ServiceClient, integrationId: string): Promise<string | null> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('metadata')
    .eq('id', integrationId)
    .single();

  const meta = integration?.metadata as Record<string, string> | null;
  return meta?.instanceName || meta?.instance_name || null;
}

/** Format a Brazilian phone number to international format */
function formatBrazilPhone(phone: string): string {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.length === 10 || formatted.length === 11) {
    formatted = '55' + formatted;
  }
  return formatted;
}

/** Resolve real phone for LID contacts */
async function resolveLidPhone(
  supabase: ServiceClient,
  phone: string,
  conversationId?: string
): Promise<string | null> {
  if (!conversationId) return null;

  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', conversationId)
    .single();

  if (!conv?.contact_id) return null;

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, metadata')
    .eq('id', conv.contact_id)
    .single();

  const contactMetadata = contact?.metadata as Record<string, string> | null;
  const realPhone = contactMetadata?.real_phone || contactMetadata?.lid_phone;

  if (contact?.phone && !contact.phone.includes('@lid')) {
    return contact.phone;
  }
  return realPhone || null;
}

/** Send a text message via Evolution API with LID fallback logic */
export async function sendWhatsAppMessage(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  integrationId: string,
  phone: string,
  message: string,
  supabase: ServiceClient,
  conversationId?: string
): Promise<boolean> {
  const instanceName = await getInstanceName(supabase, integrationId);
  if (!instanceName) {
    log.error('❌ Instance name not found for integration:', integrationId);
    return false;
  }

  const isLidContact = phone.includes('@lid') || phone.replace(/\D/g, '').length >= 15;

  // Try real phone for LID contacts
  if (isLidContact) {
    const realPhone = await resolveLidPhone(supabase, phone, conversationId);

    if (realPhone) {
      const formatted = formatBrazilPhone(realPhone);
      log.info(`📤 Sending to LID contact via real phone ${formatted} via ${instanceName}`);

      try {
        const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: formatted, text: message }),
        });
        const responseText = await response.text();
        log.info(`📥 Evolution API LID→real phone response (${response.status}):`, responseText.substring(0, 200));
        if (response.ok) {
          log.info('✅ LID message sent via real phone successfully');
          return true;
        }
        log.error('❌ WhatsApp LID→real phone error:', response.status, responseText);
      } catch (error) {
        log.error('❌ WhatsApp LID→real phone fetch error:', error);
      }
    }

    // Fallback: try LID JID directly
    if (phone.includes('@lid')) {
      log.info(`📤 Sending to LID JID ${phone} via ${instanceName} (direct)`);
      try {
        const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phone, text: message }),
        });
        const responseText = await response.text();
        if (response.ok) {
          log.info('✅ LID direct message sent successfully');
          return true;
        }
        log.error('❌ WhatsApp LID direct error:', response.status, responseText);
      } catch (error) {
        log.error('❌ WhatsApp LID direct fetch error:', error);
      }

      if (!realPhone) {
        log.error('❌ All LID send attempts failed and no real phone available');
        return false;
      }
    }
  }

  // Normal send for regular phone numbers
  const formattedPhone = formatBrazilPhone(phone);
  log.info(`📤 Sending text message to ${formattedPhone} via ${instanceName}`);

  try {
    const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: formattedPhone, text: message }),
    });

    const responseText = await response.text();
    log.info(`📥 Evolution API response (${response.status}):`, responseText.substring(0, 200));

    if (!response.ok) {
      log.error('❌ WhatsApp send error:', response.status, responseText);
      return false;
    }

    log.info('✅ Message sent successfully to WhatsApp');
    return true;
  } catch (error) {
    log.error('❌ WhatsApp send fetch error:', error);
    return false;
  }
}

/** Send interactive buttons via Evolution API */
export async function sendWhatsAppButtons(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  integrationId: string,
  phone: string,
  title: string,
  description: string,
  buttons: InteractiveButton[],
  supabase: ServiceClient
): Promise<boolean> {
  const instanceName = await getInstanceName(supabase, integrationId);
  if (!instanceName) {
    log.error('❌ Instance name not found for integration:', integrationId);
    return false;
  }

  const formattedPhone = formatBrazilPhone(phone);

  const buttonsPayload = buttons.slice(0, 3).map(btn => ({
    type: "reply",
    reply: {
      id: btn.id,
      title: btn.display_text.substring(0, 20),
    },
  }));

  log.info(`📤 Sending ${buttonsPayload.length} buttons to ${formattedPhone} via ${instanceName}`);

  try {
    const response = await fetch(`${evolutionApiUrl}/message/sendButtons/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: formattedPhone,
        title: title.substring(0, 60),
        description: description.substring(0, 1024),
        footer: 'Escolha uma opção',
        buttons: buttonsPayload,
      }),
    });

    const responseText = await response.text();
    log.info(`📥 Evolution API buttons response (${response.status}):`, responseText.substring(0, 200));

    if (!response.ok) {
      log.error('❌ WhatsApp buttons send error:', response.status, responseText);
      return false;
    }

    log.info('✅ Buttons sent successfully to WhatsApp');
    return true;
  } catch (error) {
    log.error('❌ WhatsApp buttons fetch error:', error);
    return false;
  }
}
