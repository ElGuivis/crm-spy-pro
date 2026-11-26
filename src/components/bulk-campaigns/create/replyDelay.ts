export interface ReplyDelay { min: string; max: string }
export const DEFAULT_REPLY_DELAY: ReplyDelay = { min: "30", max: "90" };

const clamp = (v: string, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(120, n)) : fallback;
};

/** Colunas da campanha a partir dos campos (0–120 s; máximo nunca abaixo do mínimo). */
export function replyDelayPayload(d: ReplyDelay) {
  const min = clamp(d.min, 30);
  return { reply_delay_min_seconds: min, reply_delay_max_seconds: Math.max(min, clamp(d.max, 90)) };
}
