// Ritmo de envio: nenhuma automação despeja a lista de uma vez. O que falta enviar hoje é espalhado em intervalos IGUAIS
// até o fim da janela de envio (08h–21h de Brasília). O cron roda a cada 10 min; a cada execução a regra decide se já
// passou o intervalo desde o último envio e, se sim, libera 1 mensagem (mais de uma só se a lista for tão grande que 1 por execução não basta).
import { SEND_WINDOW_END_HOUR, brtDate } from "./brt.ts";

export const RUN_INTERVAL_MS = 10 * 60_000; // intervalo do cron

/** Tempo que resta até o fim da janela de envio de hoje (Brasília). */
export function windowRemainingMs(d: Date = new Date()): number {
  const end = new Date(`${brtDate(d)}T${String(SEND_WINDOW_END_HOUR).padStart(2, "0")}:00:00-03:00`);
  return Math.max(0, end.getTime() - d.getTime());
}

/** Intervalo ideal entre mensagens: o que resta da janela dividido pelo que falta enviar. */
export function idealGapMs(pending: number, d: Date = new Date()): number {
  return pending > 0 ? windowRemainingMs(d) / pending : Infinity;
}

/**
 * Quantas mensagens esta execução pode enviar. 0 = ainda não é a hora (o último envio foi há menos que o intervalo ideal).
 * Lista pequena: 1 por vez, espaçada. Lista grande (intervalo menor que o do cron): mais de 1 por execução.
 */
export function paceQuota(pending: number, lastSentAt: Date | null, d: Date = new Date()): number {
  if (pending <= 0) return 0;
  const gap = idealGapMs(pending, d);
  const since = lastSentAt ? d.getTime() - lastSentAt.getTime() : Infinity;
  if (since < gap - RUN_INTERVAL_MS / 2) return 0; // como a execução é a cada 10 min, aceita chegar até 5 min antes do ideal
  return Math.max(1, Math.floor(RUN_INTERVAL_MS / gap));
}

/** Intervalo médio entre mensagens dentro da mesma execução (só importa quando a cota é maior que 1), entre 3 s e 14 s. */
export function gapMs(quota: number, budgetMs = 100_000): number {
  return Math.min(14_000, Math.max(3_000, Math.floor(budgetMs / Math.max(quota, 1))));
}

/** Espera entre duas mensagens da mesma execução (aleatória, para não sair em rajada). */
export function pauseBetweenSends(quota = 1): Promise<void> {
  return new Promise((r) => setTimeout(r, gapMs(quota) * (0.6 + Math.random() * 0.8)));
}
