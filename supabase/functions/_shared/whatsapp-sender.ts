/**
 * WhatsApp sender utility using Evolution API
 * Sends messages directly without n8n intermediary
 * Includes tokenized sending functions that check balance, send, and deduct tokens
 *
 * A base (tipos, formatação, POST com repetição, cobrança) fica em `wa-sender-core.ts`;
 * este arquivo reexporta tudo para os módulos continuarem importando daqui.
 */

import {
  evolutionPost,
  sendWithTokenCharge,
  type ServiceClient,
  type WhatsAppConfig,
  type WhatsAppSendResult,
} from "./wa-sender-core.ts";

export {
  extractPhoneFromJid,
  formatPhoneNumber,
  mapEvolutionStatus,
  type InteractiveButton,
  type WhatsAppConfig,
  type WhatsAppSendResult,
} from "./wa-sender-core.ts";

type ListSection = { title: string; rows: { rowId: string; title: string; description?: string }[] };

/**
 * Send WhatsApp text message as a reply to another message
 * This is crucial for LID contacts - replies work even when direct sends fail
 */
export function sendWhatsAppReply(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  quotedMessageId: string,
  maxRetries: number = 3,
): Promise<WhatsAppSendResult> {
  return evolutionPost(config, 'sendText', phone, (number) => ({
    number,
    text: message,
    quoted: { key: { id: quotedMessageId }, message: { conversation: "" } },
  }), 'WHATSAPP-REPLY', maxRetries);
}

/** Send WhatsApp text message via Evolution API (com repetição e espera exponencial) */
export function sendWhatsAppMessage(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  maxRetries: number = 3,
): Promise<WhatsAppSendResult> {
  return evolutionPost(config, 'sendText', phone, (number) => ({ number, text: message }), 'WHATSAPP-SENDER', maxRetries);
}

/** Send WhatsApp message with interactive buttons (limite do WhatsApp: 3, título de até 20 caracteres) */
export function sendWhatsAppButtons(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttons: { id: string; displayText: string }[],
  footer?: string,
  maxRetries: number = 3,
): Promise<WhatsAppSendResult> {
  const buttonsPayload = buttons.slice(0, 3).map((btn) => ({
    type: "reply",
    reply: { id: btn.id, title: btn.displayText.substring(0, 20) },
  }));
  return evolutionPost(config, 'sendButtons', phone, (number) => ({
    number,
    title,
    description,
    footer: footer || '',
    buttons: buttonsPayload,
  }), 'WHATSAPP-BUTTONS', maxRetries);
}

/** Send WhatsApp list message via Evolution API */
export function sendWhatsAppList(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttonText: string,
  sections: ListSection[],
  maxRetries: number = 3,
  footerText?: string,
): Promise<WhatsAppSendResult> {
  return evolutionPost(config, 'sendList', phone, (number) => ({
    number,
    title,
    description,
    buttonText,
    footerText: footerText || ' ', // a Evolution recusa a lista sem footerText (400)
    sections,
  }), 'WHATSAPP-LIST', maxRetries);
}

// ========== TOKENIZED SENDING FUNCTIONS ==========
// Conferem o saldo, enviam e debitam 1 token só se o envio deu certo.

/** Send WhatsApp reply WITH token charging */
export function sendReplyWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  quotedMessageId: string,
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Resposta automática enviada',
  referenceId?: string,
): Promise<WhatsAppSendResult> {
  return sendWithTokenCharge(
    supabase, tenantId, () => sendWhatsAppReply(config, phone, message, quotedMessageId),
    chargeType, chargeDescription, referenceId,
  );
}

/** Send WhatsApp text message WITH token charging */
export function sendTextWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  message: string,
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Mensagem automática enviada',
  referenceId?: string,
): Promise<WhatsAppSendResult> {
  return sendWithTokenCharge(
    supabase, tenantId, () => sendWhatsAppMessage(config, phone, message),
    chargeType, chargeDescription, referenceId,
  );
}

/** Send WhatsApp buttons WITH token charging */
export function sendButtonsWithTokenCharge(
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
  footer?: string,
): Promise<WhatsAppSendResult> {
  return sendWithTokenCharge(
    supabase, tenantId, () => sendWhatsAppButtons(config, phone, title, description, buttons, footer),
    chargeType, chargeDescription, referenceId,
  );
}

/** Send WhatsApp list WITH token charging */
export function sendListWithTokenCharge(
  config: WhatsAppConfig,
  phone: string,
  title: string,
  description: string,
  buttonText: string,
  sections: ListSection[],
  supabase: ServiceClient,
  tenantId: string,
  chargeType: string = 'auto_message',
  chargeDescription: string = 'Lista interativa enviada',
  referenceId?: string,
): Promise<WhatsAppSendResult> {
  return sendWithTokenCharge(
    supabase, tenantId, () => sendWhatsAppList(config, phone, title, description, buttonText, sections),
    chargeType, chargeDescription, referenceId,
  );
}
