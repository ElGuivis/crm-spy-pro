/**
 * Smart Search — extract structured data from chat messages.
 * Extracted from ai-chat/index.ts for maintainability.
 */
import { createLogger } from "./correlation.ts";
const log = createLogger("ai-chat-smart-search", "shared");


export interface SmartSearchResult {
  mentionedOrderNumber: string | null;
  mentionedCpf: string | null;
  mentionedName: string | null;
}

/**
 * Extract order numbers, CPFs, and customer names from contact messages.
 * Returns null values when smart_search is disabled.
 */
export function extractFromMessages(
  messageHistory: Array<{ sender_type: string; content: string }>,
  enabled: boolean
): SmartSearchResult {
  if (!enabled) {
    log.info('🔍 Smart search disabled - skipping message extraction');
    return { mentionedOrderNumber: null, mentionedCpf: null, mentionedName: null };
  }

  log.info('🔍 Smart search enabled - extracting data from messages');

  let mentionedOrderNumber: string | null = null;
  let mentionedCpf: string | null = null;
  let mentionedName: string | null = null;

  const contactMessages = messageHistory
    .filter(m => m.sender_type === 'contact')
    .map(m => m.content)
    .join(' ');

  // 1. Extract CPF (11 digits, possibly formatted)
  const cpfPattern = /(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})|(\d{11})/g;
  const cpfMatches = contactMessages.matchAll(cpfPattern);
  for (const match of cpfMatches) {
    const cpfDigits = (match[1] || match[2]).replace(/\D/g, '');
    if (cpfDigits.length === 11) {
      mentionedCpf = cpfDigits;
      log.info(`🔍 Found CPF: ${mentionedCpf}`);
      break;
    }
  }

  // 2. Remove CPF from string before order number search
  let messagesForOrderSearch = contactMessages;
  if (mentionedCpf) {
    messagesForOrderSearch = messagesForOrderSearch
      .replace(new RegExp(mentionedCpf, 'g'), '')
      .replace(new RegExp(
        mentionedCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
        'g'
      ), '');
  }

  // 3. Extract order number (4-10 digits, not 11-digit CPFs)
  const orderNumberPatterns = [
    /pedido[:\s#]*(\d{3,})/gi,
    /n[uú]mero[:\s#]*(\d{3,})/gi,
    /#(\d{4,})/g,
    /\b(\d{4,10})\b/g,
  ];

  for (const pattern of orderNumberPatterns) {
    const matches = messagesForOrderSearch.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        mentionedOrderNumber = match[1];
        log.info(`🔍 Found order number: ${mentionedOrderNumber}`);
        break;
      }
    }
    if (mentionedOrderNumber) break;
  }

  // 4. Extract potential customer name (2+ capitalized words)
  const namePattern = /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+)+)\b/g;
  const nameMatches = contactMessages.matchAll(namePattern);
  for (const match of nameMatches) {
    if (match[1] && match[1].length > 5) {
      mentionedName = match[1];
      break;
    }
  }

  log.info(`🔍 Extracted - Order: ${mentionedOrderNumber}, CPF: ${mentionedCpf}, Name: ${mentionedName}`);
  return { mentionedOrderNumber, mentionedCpf, mentionedName };
}
