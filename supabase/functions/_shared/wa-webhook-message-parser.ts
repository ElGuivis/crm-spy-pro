/**
 * WhatsApp webhook message parsing utilities.
 * Extracts structured data from Evolution API payloads.
 */

export interface EvolutionMessage {
  event: string;
  instance: string;
  sender?: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { url?: string; caption?: string };
      audioMessage?: { url?: string };
      documentMessage?: { url?: string; fileName?: string };
      buttonsResponseMessage?: { selectedButtonId: string; selectedDisplayText: string };
      listResponseMessage?: { singleSelectReply?: { selectedRowId: string }; title?: string };
    };
    messageTimestamp?: number;
  };
}

export interface ParsedMessageContent {
  text: string;
  contentType: string;
  mediaUrl: string;
  buttonClickId: string;
}

/**
 * Extract message content, type, media URL, and button click info from an Evolution payload.
 */
export function parseMessageContent(payload: EvolutionMessage): ParsedMessageContent {
  let text = "";
  let contentType = "text";
  let mediaUrl = "";
  let buttonClickId = "";

  const msg = payload.data.message;
  if (!msg) return { text, contentType, mediaUrl, buttonClickId };

  if (msg.buttonsResponseMessage) {
    text = msg.buttonsResponseMessage.selectedDisplayText;
    buttonClickId = msg.buttonsResponseMessage.selectedButtonId;
  } else if (msg.listResponseMessage) {
    text = msg.listResponseMessage.title || "";
    buttonClickId = msg.listResponseMessage.singleSelectReply?.selectedRowId || "";
  } else if (msg.conversation) {
    text = msg.conversation;
  } else if (msg.extendedTextMessage?.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    text = msg.imageMessage.caption || "[Imagem]";
    contentType = "image";
    mediaUrl = msg.imageMessage.url || "";
  } else if (msg.audioMessage) {
    text = "[Áudio]";
    contentType = "audio";
    mediaUrl = msg.audioMessage.url || "";
  } else if (msg.documentMessage) {
    text = msg.documentMessage.fileName || "[Documento]";
    contentType = "document";
    mediaUrl = msg.documentMessage.url || "";
  }

  return { text, contentType, mediaUrl, buttonClickId };
}

/**
 * Replace {nome} placeholders in message templates.
 */
export function replaceMessagePlaceholders(message: string, contactName?: string): string {
  let result = message;
  if (contactName) {
    result = result.replace(/{nome}/gi, contactName);
  }
  return result;
}
