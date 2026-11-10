// Ritmo de envio: nenhuma automação despeja a lista inteira de uma vez. O trabalho do dia é dividido pelas
// execuções que ainda restam na janela de envio (08h–21h de Brasília, uma por hora) e, dentro da execução, as mensagens saem com intervalo.
import { SEND_WINDOW_END_HOUR, brtParts } from "./brt.ts";

/** Quantas execuções horárias ainda restam na janela, contando a atual (mínimo 1). */
export function runsLeftToday(d: Date = new Date()): number {
  return Math.max(1, SEND_WINDOW_END_HOUR - brtParts(d).hour);
}

/** Cota desta execução: o que falta enviar dividido pelas execuções restantes (arredondado para cima, mínimo 1 se houver pendência). */
export function paceQuota(remaining: number, d: Date = new Date()): number {
  return remaining <= 0 ? 0 : Math.ceil(remaining / runsLeftToday(d));
}

/** Intervalo médio entre mensagens: espalha a cota dentro do orçamento da execução (~100 s), entre 3 s (lista grande) e 14 s (lista pequena). */
export function gapMs(quota: number, budgetMs = 100_000): number {
  return Math.min(14_000, Math.max(3_000, Math.floor(budgetMs / Math.max(quota, 1))));
}

/** Espera entre duas mensagens (aleatória em torno do intervalo da cota, para não sair em rajada). */
export function pauseBetweenSends(quota = 1): Promise<void> {
  return new Promise((r) => setTimeout(r, gapMs(quota) * (0.6 + Math.random() * 0.8)));
}
