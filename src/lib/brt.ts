// Horário de Brasília (America/Sao_Paulo) em toda a interface, independente do fuso do aparelho.
export const BRT_TZ = "America/Sao_Paulo";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BRT_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** AAAA-MM-DD do dia em Brasília (use no lugar de toISOString().split('T')[0]). */
export function brtDate(d: Date | string | number = new Date()): string {
  return dateFmt.format(new Date(d));
}

/** Dia (AAAA-MM-DD, Brasília) de `days` dias antes/depois de agora. */
export function brtDateAfter(days: number, from: Date = new Date()): string {
  return brtDate(new Date(from.getTime() + days * 86_400_000));
}

/**
 * Lê uma data. "AAAA-MM-DD" (dia puro, como vem do banco) vira o meio-dia LOCAL desse dia; new Date("2026-11-09") seria
 * meia-noite UTC = 21h do dia 8 em Brasília e o rótulo sairia um dia antes. Qualquer outro texto (com hora) segue como new Date.
 */
export function parseDay(value: string | number | Date): Date {
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }
  return new Date(value);
}

type LocaleFn = (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) => string;

/** Faz toLocaleString/Date/TimeString usarem Brasília quando o código não escolhe um fuso. Chamar uma vez na entrada do app. */
export function installBrtDefaults(): void {
  const proto = Date.prototype as unknown as Record<string, LocaleFn & { __brt?: true }>;
  for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    const original = proto[name];
    if (original.__brt) continue;
    const patched: LocaleFn & { __brt?: true } = function (this: Date, locales, options) {
      return original.call(this, locales, { timeZone: BRT_TZ, ...options });
    };
    patched.__brt = true;
    proto[name] = patched;
  }
}
