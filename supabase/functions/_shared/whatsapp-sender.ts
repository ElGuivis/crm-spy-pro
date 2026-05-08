/**
 * WhatsApp sender utility using Evolution API
 * Sends messages directly without n8n intermediary
 * Includes tokenized sending functions that check balance, send, and deduct tokens
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("whatsapp-sender", "shared");

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attempts?: number;
  tokenDeducted?: boolean;
}

export interface WhatsAppConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
}

export interface InteractiveButton {
  id: string;
  display_text: string;
  action_type: 'transfer_to_agent' | 'send_response' | 'transfer_to_human';
  target_agent_id?: string;
  response_message?: string;
}

/**
 * Format phone number to WhatsApp format
 * Handles both regular phone numbers and LID contacts (Meta Ads)
 * Returns object with formatted number and isLid flag
 */
export function formatPhoneNumber(phone: string): { number: string; isLid: boolean } {
  // Handle LID contacts (Meta Ads / Click-to-WhatsApp)
  // Format: "123456789@lid" - extract just the numeric LID
  if (phone.includes('@lid')) {
    const lidPart = phone.replace('@lid', '');
    log.info('[WHATSAPP-SENDER] LID contact detected:', lidPart);
    return { number: lidPart, isLid: true };
  }
  
  // Remove all non-digit characters (for regular phone numbers)
  let cleaned = phone.replace(/\D/g, '');
  
  // Check if this is a LID that was already cleaned (15+ digit numbers)
  // LIDs are typically 15-18 digits, much longer than phone numbers
  if (cleaned.length >= 15) {
    log.info('[WHATSAPP-SENDER] Possible LID (long number):', cleaned);
    return { number: cleaned, isLid: true };
  }
  
  // Normal phone number formatting for Brazil
  // If starts with 0, remove it
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // If doesn't start with country code (55 for Brazil), add it
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  
  return { number: cleaned, isLid: false };
}

/**
 * Get the number string to send to Evolution API
 * For LID contacts, append @lid suffix
 */
function getEvolutionNumber(phoneInfo: { number: string; isLid: boolean }): string {
  return phoneInfo.isLid ? `${phoneInfo.number}@lid` : phoneInfo.number;
}

/**
 * Send WhatsApp text message as a reply to another message
 * This is crucial for LID contacts - replies work even when direct sends fail
 */
export async function sendWhatsAppReply(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  quotedMessageId: string,
  maxRetries: number = 3
): Promise<WhatsAppSendResult> {
  const phoneInfo = formatPhoneNumber(phone);
  const numberToSend = getEvolutionNumber(phoneInfo);
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[WHATSAPP-REPLY] Attempt ${attempt}/${maxRetries} - Replying to ${numberToSend} (quoting: ${quotedMessageId})`);
      
      const response = await fetch(`${baseUrl}/message/sendText/${config.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': config.evolutionApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: numberToSend,
          text: message,
          quoted: {
            key: {
              id: quotedMessageId
            },
            message: {
              conversation: ""
            }
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        log.info(`[WHATSAPP-REPLY] ✅ Reply sent successfully to ${numberToSend}`);
        
        return {
          success: true,
          messageId: data.key?.id || data.messageId,
          attempts: attempt
        };
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.error(`[WHATSAPP-REPLY] Attempt ${attempt} failed:`, lastError);
      
      // Don't retry on client errors (4xx) except rate limiting
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[WHATSAPP-REPLY] Attempt ${attempt} exception:`, lastError);
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      log.info(`[WHATSAPP-REPLY] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
}

/**
 * Send WhatsApp reply WITH token charging
 */
export async function sendReplyWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  quotedMessageId: string,
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Resposta automática enviada',
  referenceId?: string
): Promise<WhatsAppSendResult> {
  log.info(`💰 [TOKENIZED-REPLY] Checking tokens for reply - tenant: ${tenantId}`);
  
  // 1. Check token balance
  const { data: hasTokens, error: tokenCheckError } = await supabase.rpc('has_enough_tokens', { 
    _tenant_id: tenantId, 
    _amount: 1 
  });

  if (tokenCheckError) {
    log.error(`❌ [TOKENIZED-REPLY] Token check error:`, tokenCheckError);
    return { success: false, error: 'TOKEN_CHECK_FAILED', tokenDeducted: false };
  }

  if (!hasTokens) {
    log.warn(`⚠️ [TOKENIZED-REPLY] Insufficient tokens for tenant ${tenantId} - NOT sending`);
    return { success: false, error: 'INSUFFICIENT_TOKENS', tokenDeducted: false };
  }

  // 2. Send reply
  log.info(`📤 [TOKENIZED-REPLY] Sending reply to ${phone} (quoting: ${quotedMessageId})...`);
  const sendResult = await sendWhatsAppReply(config, phone, message, quotedMessageId);

  if (!sendResult.success) {
    log.error(`❌ [TOKENIZED-REPLY] Send failed: ${sendResult.error} - NOT deducting token`);
    return { ...sendResult, tokenDeducted: false };
  }

  // 3. Deduct token on success
  log.info(`💰 [TOKENIZED-REPLY] Deducting 1 token for ${chargeType}...`);
  const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
    _type: chargeType,
    _description: chargeDescription,
    _reference_id: referenceId || null
  });

  if (deductError) {
    log.error(`❌ [TOKENIZED-REPLY] Token deduction error:`, deductError);
  } else if (!deducted) {
    log.warn(`⚠️ [TOKENIZED-REPLY] deduct_tokens returned false - race condition?`);
  } else {
    log.info(`✅ [TOKENIZED-REPLY] 1 token deducted for: ${chargeDescription}`);
  }

  return { ...sendResult, tokenDeducted: !!deducted };
}

/**
 * Send WhatsApp text message via Evolution API
 * Includes retry logic with exponential backoff
 */
export async function sendWhatsAppMessage(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  maxRetries: number = 3
): Promise<WhatsAppSendResult> {
  const phoneInfo = formatPhoneNumber(phone);
  const numberToSend = getEvolutionNumber(phoneInfo);
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[WHATSAPP-SENDER] Attempt ${attempt}/${maxRetries} - Sending to ${numberToSend} (isLid: ${phoneInfo.isLid})`);
      
      const response = await fetch(`${baseUrl}/message/sendText/${config.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': config.evolutionApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: numberToSend,
          text: message
        })
      });

      if (response.ok) {
        const data = await response.json();
        log.info(`[WHATSAPP-SENDER] ✅ Message sent successfully to ${numberToSend}`);
        
        return {
          success: true,
          messageId: data.key?.id || data.messageId,
          attempts: attempt
        };
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.error(`[WHATSAPP-SENDER] Attempt ${attempt} failed:`, lastError);
      
      // Don't retry on client errors (4xx) except rate limiting
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[WHATSAPP-SENDER] Attempt ${attempt} exception:`, lastError);
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      log.info(`[WHATSAPP-SENDER] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
}

/**
 * Send WhatsApp message with interactive buttons via Evolution API
 * Supports up to 3 buttons (WhatsApp limit)
 */
export async function sendWhatsAppButtons(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttons: { id: string; displayText: string }[],
  footer?: string,
  maxRetries: number = 3
): Promise<WhatsAppSendResult> {
  const phoneInfo = formatPhoneNumber(phone);
  const numberToSend = getEvolutionNumber(phoneInfo);
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  
  // Evolution API supports max 3 buttons
  const buttonsPayload = buttons.slice(0, 3).map(btn => ({
    type: "reply",
    reply: {
      id: btn.id,
      title: btn.displayText.substring(0, 20)
    }
  }));

  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[WHATSAPP-BUTTONS] Attempt ${attempt}/${maxRetries} - Sending ${buttonsPayload.length} buttons to ${numberToSend} (isLid: ${phoneInfo.isLid})`);
      
      const response = await fetch(`${baseUrl}/message/sendButtons/${config.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': config.evolutionApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: numberToSend,
          title: title,
          description: description,
          footer: footer || '',
          buttons: buttonsPayload
        })
      });

      if (response.ok) {
        const data = await response.json();
        log.info(`[WHATSAPP-BUTTONS] ✅ Buttons sent successfully to ${numberToSend}`);
        
        return {
          success: true,
          messageId: data.key?.id || data.messageId,
          attempts: attempt
        };
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.error(`[WHATSAPP-BUTTONS] Attempt ${attempt} failed:`, lastError);
      
      // Don't retry on client errors (4xx) except rate limiting
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[WHATSAPP-BUTTONS] Attempt ${attempt} exception:`, lastError);
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
}

/**
 * Send WhatsApp list message via Evolution API
 */
export async function sendWhatsAppList(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttonText: string,
  sections: { title: string; rows: { rowId: string; title: string; description?: string }[] }[],
  maxRetries: number = 3
): Promise<WhatsAppSendResult> {
  const phoneInfo = formatPhoneNumber(phone);
  const numberToSend = getEvolutionNumber(phoneInfo);
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[WHATSAPP-LIST] Attempt ${attempt}/${maxRetries} - Sending list to ${numberToSend} (isLid: ${phoneInfo.isLid})`);
      
      const response = await fetch(`${baseUrl}/message/sendList/${config.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': config.evolutionApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: numberToSend,
          title: title,
          description: description,
          buttonText: buttonText,
          sections: sections
        })
      });

      if (response.ok) {
        const data = await response.json();
        log.info(`[WHATSAPP-LIST] ✅ List sent successfully to ${numberToSend}`);
        
        return {
          success: true,
          messageId: data.key?.id || data.messageId,
          attempts: attempt
        };
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.error(`[WHATSAPP-LIST] Attempt ${attempt} failed:`, lastError);
      
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[WHATSAPP-LIST] Attempt ${attempt} exception:`, lastError);
    }

    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
}

// ========== TOKENIZED SENDING FUNCTIONS ==========
// These functions check token balance, send, and deduct tokens atomically

/**
 * Send WhatsApp text message WITH token charging
 * 1. Check token balance
 * 2. Send message
 * 3. Deduct token on success
 */
export async function sendTextWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Mensagem automática enviada',
  referenceId?: string
): Promise<WhatsAppSendResult> {
  log.info(`💰 [TOKENIZED] Checking tokens for text message - tenant: ${tenantId}`);
  
  // 1. Check token balance
  const { data: hasTokens, error: tokenCheckError } = await supabase.rpc('has_enough_tokens', { 
    _tenant_id: tenantId, 
    _amount: 1 
  });

  if (tokenCheckError) {
    log.error(`❌ [TOKENIZED] Token check error:`, tokenCheckError);
    return { success: false, error: 'TOKEN_CHECK_FAILED', tokenDeducted: false };
  }

  if (!hasTokens) {
    log.warn(`⚠️ [TOKENIZED] Insufficient tokens for tenant ${tenantId} - NOT sending`);
    return { success: false, error: 'INSUFFICIENT_TOKENS', tokenDeducted: false };
  }

  // 2. Send message
  log.info(`📤 [TOKENIZED] Sending text message to ${phone}...`);
  const sendResult = await sendWhatsAppMessage(config, phone, message);

  if (!sendResult.success) {
    log.error(`❌ [TOKENIZED] Send failed: ${sendResult.error} - NOT deducting token`);
    return { ...sendResult, tokenDeducted: false };
  }

  // 3. Deduct token on success
  log.info(`💰 [TOKENIZED] Deducting 1 token for ${chargeType}...`);
  const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
    _type: chargeType,
    _description: chargeDescription,
    _reference_id: referenceId || null
  });

  if (deductError) {
    log.error(`❌ [TOKENIZED] Token deduction error:`, deductError);
  } else if (!deducted) {
    log.warn(`⚠️ [TOKENIZED] deduct_tokens returned false - race condition?`);
  } else {
    log.info(`✅ [TOKENIZED] 1 token deducted for: ${chargeDescription}`);
  }

  return { ...sendResult, tokenDeducted: !!deducted };
}

/**
 * Send WhatsApp buttons WITH token charging
 */
export async function sendButtonsWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttons: { id: string; displayText: string }[],
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Botões interativos enviados',
  referenceId?: string,
  footer?: string
): Promise<WhatsAppSendResult> {
  log.info(`💰 [TOKENIZED] Checking tokens for buttons - tenant: ${tenantId}`);
  
  // 1. Check token balance
  const { data: hasTokens, error: tokenCheckError } = await supabase.rpc('has_enough_tokens', { 
    _tenant_id: tenantId, 
    _amount: 1 
  });

  if (tokenCheckError) {
    log.error(`❌ [TOKENIZED] Token check error:`, tokenCheckError);
    return { success: false, error: 'TOKEN_CHECK_FAILED', tokenDeducted: false };
  }

  if (!hasTokens) {
    log.warn(`⚠️ [TOKENIZED] Insufficient tokens for tenant ${tenantId} - NOT sending`);
    return { success: false, error: 'INSUFFICIENT_TOKENS', tokenDeducted: false };
  }

  // 2. Send buttons
  log.info(`📤 [TOKENIZED] Sending buttons to ${phone}...`);
  const sendResult = await sendWhatsAppButtons(config, phone, title, description, buttons, footer);

  if (!sendResult.success) {
    log.error(`❌ [TOKENIZED] Buttons send failed: ${sendResult.error} - NOT deducting token`);
    return { ...sendResult, tokenDeducted: false };
  }

  // 3. Deduct token on success
  log.info(`💰 [TOKENIZED] Deducting 1 token for ${chargeType}...`);
  const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
    _type: chargeType,
    _description: chargeDescription,
    _reference_id: referenceId || null
  });

  if (deductError) {
    log.error(`❌ [TOKENIZED] Token deduction error:`, deductError);
  } else if (!deducted) {
    log.warn(`⚠️ [TOKENIZED] deduct_tokens returned false`);
  } else {
    log.info(`✅ [TOKENIZED] 1 token deducted for: ${chargeDescription}`);
  }

  return { ...sendResult, tokenDeducted: !!deducted };
}

/**
 * Send WhatsApp list WITH token charging
 */
export async function sendListWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttonText: string,
  sections: { title: string; rows: { rowId: string; title: string; description?: string }[] }[],
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Lista interativa enviada',
  referenceId?: string
): Promise<WhatsAppSendResult> {
  log.info(`💰 [TOKENIZED] Checking tokens for list - tenant: ${tenantId}`);
  
  // 1. Check token balance
  const { data: hasTokens, error: tokenCheckError } = await supabase.rpc('has_enough_tokens', { 
    _tenant_id: tenantId, 
    _amount: 1 
  });

  if (tokenCheckError) {
    log.error(`❌ [TOKENIZED] Token check error:`, tokenCheckError);
    return { success: false, error: 'TOKEN_CHECK_FAILED', tokenDeducted: false };
  }

  if (!hasTokens) {
    log.warn(`⚠️ [TOKENIZED] Insufficient tokens for tenant ${tenantId} - NOT sending`);
    return { success: false, error: 'INSUFFICIENT_TOKENS', tokenDeducted: false };
  }

  // 2. Send list
  log.info(`📤 [TOKENIZED] Sending list to ${phone}...`);
  const sendResult = await sendWhatsAppList(config, phone, title, description, buttonText, sections);

  if (!sendResult.success) {
    log.error(`❌ [TOKENIZED] List send failed: ${sendResult.error} - NOT deducting token`);
    return { ...sendResult, tokenDeducted: false };
  }

  // 3. Deduct token on success
  log.info(`💰 [TOKENIZED] Deducting 1 token for ${chargeType}...`);
  const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
    _type: chargeType,
    _description: chargeDescription,
    _reference_id: referenceId || null
  });

  if (deductError) {
    log.error(`❌ [TOKENIZED] Token deduction error:`, deductError);
  } else if (!deducted) {
    log.warn(`⚠️ [TOKENIZED] deduct_tokens returned false`);
  } else {
    log.info(`✅ [TOKENIZED] 1 token deducted for: ${chargeDescription}`);
  }

  return { ...sendResult, tokenDeducted: !!deducted };
}

/**
 * Get WhatsApp integration config for a tenant
 */
export async function getWhatsAppConfig(
  supabase: ServiceClient,
  tenantId: string,
  integrationId?: string
): Promise<{ config: WhatsAppConfig | null; error?: string }> {
  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionUrl || !evolutionApiKey) {
    return { config: null, error: 'Evolution API credentials not configured' };
  }

  // Build query
  let query = supabase
    .from('integrations')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .eq('type', 'evolution_whatsapp')
    .eq('status', 'connected');
  
  if (integrationId) {
    query = query.eq('id', integrationId);
  }
  
  const { data: integration, error } = await query.limit(1).maybeSingle();

  if (error || !integration) {
    return { config: null, error: 'No connected WhatsApp integration found' };
  }

  const metadata = integration.metadata as Record<string, unknown>;
  const instanceName = metadata?.instanceName || metadata?.instance_name;

  if (!instanceName) {
    return { config: null, error: 'WhatsApp instance name not found' };
  }

  return {
    config: {
      evolutionApiUrl: evolutionUrl,
      evolutionApiKey: evolutionApiKey,
      instanceName: instanceName as string
    }
  };
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Map Evolution API message status to our internal status format
 */
export function mapEvolutionStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'PENDING': 'pending',
    'SENT': 'sent',
    'DELIVERY_ACK': 'delivered',
    'READ': 'read',
    'PLAYED': 'read', // For audio messages
    'FAILED': 'failed',
    'ERROR': 'failed'
  };
  return statusMap[status?.toUpperCase()] || status?.toLowerCase() || 'unknown';
}

/**
 * Extract phone number from WhatsApp JID format
 */
export function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace('@g.us', '')
    .replace(/\D/g, '');
}
