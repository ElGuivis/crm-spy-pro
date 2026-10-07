/**
 * Base do envio WhatsApp via Evolution API: tipos, formatação de número,
 * POST com repetição e cobrança de token. Use `whatsapp-sender.ts` nos módulos.
 */

import { createLogger } from "./correlation.ts";
const log = createLogger("whatsapp-sender", "shared");

// deno-lint-ignore no-explicit-any
export type ServiceClient = any;

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
  // Contatos LID (Meta Ads / Click-to-WhatsApp): "123456789@lid"
  if (phone.includes('@lid')) {
    const lidPart = phone.replace('@lid', '');
    log.info('[WHATSAPP-SENDER] LID contact detected:', lidPart);
    return { number: lidPart, isLid: true };
  }

  let cleaned = phone.replace(/\D/g, '');

  // LIDs já limpos têm 15+ dígitos, bem mais que um telefone
  if (cleaned.length >= 15) {
    log.info('[WHATSAPP-SENDER] Possible LID (long number):', cleaned);
    return { number: cleaned, isLid: true };
  }

  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);

  // Sem código do país (55 Brasil), acrescenta
  if (!cleaned.startsWith('55') && cleaned.length <= 11) cleaned = '55' + cleaned;

  return { number: cleaned, isLid: false };
}

/** Número que vai para a Evolution: LID leva o sufixo @lid. */
export function getEvolutionNumber(phoneInfo: { number: string; isLid: boolean }): string {
  return phoneInfo.isLid ? `${phoneInfo.number}@lid` : phoneInfo.number;
}

/**
 * POST na Evolution com até `maxRetries` tentativas e espera exponencial (1s, 2s, 4s).
 * Erro 4xx (menos 429) não repete. `buildBody` recebe o número já pronto para a API.
 */
export async function evolutionPost(
  config: WhatsAppConfig,
  endpoint: string,
  phone: string,
  buildBody: (numberToSend: string) => Record<string, unknown>,
  tag: string,
  maxRetries = 3,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<WhatsAppSendResult> {
  const phoneInfo = formatPhoneNumber(phone);
  const numberToSend = getEvolutionNumber(phoneInfo);
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, '');
  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[${tag}] Attempt ${attempt}/${maxRetries} - ${endpoint} to ${numberToSend} (isLid: ${phoneInfo.isLid})`);

      const response = await fetch(`${baseUrl}/message/${endpoint}/${config.instanceName}`, {
        method: 'POST',
        headers: { 'apikey': config.evolutionApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(numberToSend)),
      });

      if (response.ok) {
        const data = await response.json();
        log.info(`[${tag}] ✅ Sent successfully to ${numberToSend}`);
        return { success: true, messageId: data.key?.id || data.messageId, attempts: attempt };
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status}: ${errorText}`;
      log.error(`[${tag}] Attempt ${attempt} failed:`, lastError);

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { success: false, error: lastError, attempts: attempt };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[${tag}] Attempt ${attempt} exception:`, lastError);
    }

    if (attempt < maxRetries) await sleep(Math.pow(2, attempt - 1) * 1000);
  }

  return { success: false, error: lastError, attempts: maxRetries };
}

/**
 * Cobra 1 token só se o envio deu certo: confere saldo, envia, debita.
 * Sem saldo não envia; envio que falhou não debita.
 */
export async function sendWithTokenCharge(
  supabase: ServiceClient,
  tenantId: string,
  send: () => Promise<WhatsAppSendResult>,
  chargeType: string,
  chargeDescription: string,
  referenceId?: string,
): Promise<WhatsAppSendResult> {
  const { data: hasTokens, error: tokenCheckError } = await supabase.rpc('has_enough_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
  });

  if (tokenCheckError) {
    log.error(`❌ [TOKENIZED] Token check error:`, tokenCheckError);
    return { success: false, error: 'TOKEN_CHECK_FAILED', tokenDeducted: false };
  }
  if (!hasTokens) {
    log.warn(`⚠️ [TOKENIZED] Insufficient tokens for tenant ${tenantId} - NOT sending`);
    return { success: false, error: 'INSUFFICIENT_TOKENS', tokenDeducted: false };
  }

  const sendResult = await send();
  if (!sendResult.success) {
    log.error(`❌ [TOKENIZED] Send failed: ${sendResult.error} - NOT deducting token`);
    return { ...sendResult, tokenDeducted: false };
  }

  const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
    _tenant_id: tenantId,
    _amount: 1,
    _type: chargeType,
    _description: chargeDescription,
    _reference_id: referenceId || null,
  });

  if (deductError) log.error(`❌ [TOKENIZED] Token deduction error:`, deductError);
  else if (!deducted) log.warn(`⚠️ [TOKENIZED] deduct_tokens returned false - race condition?`);
  else log.info(`✅ [TOKENIZED] 1 token deducted for: ${chargeDescription}`);

  return { ...sendResult, tokenDeducted: !!deducted };
}

/** Map Evolution API message status to our internal status format */
export function mapEvolutionStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'PENDING': 'pending',
    'SENT': 'sent',
    'DELIVERY_ACK': 'delivered',
    'READ': 'read',
    'PLAYED': 'read', // áudio
    'FAILED': 'failed',
    'ERROR': 'failed',
  };
  return statusMap[status?.toUpperCase()] || status?.toLowerCase() || 'unknown';
}

/** Extract phone number from WhatsApp JID format */
export function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace('@g.us', '')
    .replace(/\D/g, '');
}
