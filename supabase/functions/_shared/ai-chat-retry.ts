/**
 * Espera para tentar de novo quando o provedor de IA limita a taxa (HTTP 429 / rate_limit_exceeded).
 * A Groq informa o tempo no cabecalho retry-after ou no texto ("Please try again in 6.05s" / "772.5ms").
 */

export const MAX_RETRY_WAIT_MS = 20_000;
const SAFETY_MS = 300;

/** Milissegundos a esperar, ou null se nao ha como saber ou se passa do limite aceitavel. */
export function retryDelayMs(retryAfterHeader: string | null, bodyText: string): number | null {
  let ms: number | null = null;

  const header = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(header) && header >= 0) ms = header * 1000;

  if (ms === null) {
    const m = /try again in\s+([\d.]+)\s*(ms|s)\b/i.exec(bodyText);
    if (m) ms = Number(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000);
  }

  if (ms === null || !Number.isFinite(ms)) return null;
  const wait = Math.ceil(ms) + SAFETY_MS;
  return wait <= MAX_RETRY_WAIT_MS ? wait : null;
}

export function isRateLimited(status: number, bodyText: string): boolean {
  return status === 429 || /rate_limit_exceeded/i.test(bodyText);
}

/** Mensagem ao cliente quando a IA nao consegue responder (nao gasta token). */
export const AI_BUSY_MESSAGE = 'Desculpe, estou com muitas conversas agora e não consegui responder. 🙏 Pode repetir sua pergunta em instantes? Se preferir, digite *menu* para voltar às opções ou falar com um atendente.';
