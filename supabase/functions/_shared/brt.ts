// Horário de Brasília (America/Sao_Paulo) para todas as decisões de "dia" e "hora".
// O runtime das edge functions roda em UTC: nunca use getHours()/getDate()/toISOString().split('T')
// para decidir "hoje", "agora é horário comercial" ou aniversário. Use estes auxiliares.
export const BRT_TZ = "America/Sao_Paulo";

export interface BrtParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: BRT_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short",
});

/** Ano/mês/dia/hora/minuto/dia da semana (0=domingo) de um instante, em Brasília. */
export function brtParts(d: Date = new Date()): BrtParts {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS[p.weekday] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** AAAA-MM-DD do dia em Brasília. */
export function brtDate(d: Date = new Date()): string {
  const p = brtParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** HH:MM em Brasília. */
export function brtHHMM(d: Date = new Date()): string {
  const p = brtParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Dia (AAAA-MM-DD, Brasília) de `days` dias depois de `from` (negativo = antes). */
export function brtDateAfter(days: number, from: Date = new Date()): string {
  return brtDate(new Date(from.getTime() + days * 86_400_000));
}

/** Mês e dia de uma data de nascimento guardada como AAAA-MM-DD ou ISO (sem converter fuso). */
export function birthMonthDay(value: string | null | undefined): { month: number; day: number } | null {
  const m = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? { month: Number(m[2]), day: Number(m[3]) } : null;
}

/** Instante (ISO, UTC) em que o dia de Brasília de `d` começou (00:00 -03:00). */
export function brtDayStartIso(d: Date = new Date()): string {
  return new Date(`${brtDate(d)}T00:00:00-03:00`).toISOString();
}
