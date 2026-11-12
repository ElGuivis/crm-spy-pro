// Estado de cada cliente na reativação: qual é o próximo passo e se já pode sair. Funções puras (testadas em tests/reactivation-state.test.ts).
// "Episódio" = o período de inatividade que começa numa compra: execuções ligadas a OUTRA última compra são de um episódio antigo e não contam.
import { normEmail, normPhone } from "../_shared/contact-policy.ts";

export interface ExecRow { created_at: string; cycle_step: number | null; last_order_date: string | null; status: string | null; attempt_no: number | null }
export interface StepRef { step_number: number; delay_days: number }
export type Decision = { send: true; stepIndex: number; attemptNo: number } | { send: false; reason: string };

const DAY_MS = 86_400_000;
/** Status que contam como mensagem de fato enviada (entram no limite de tentativas). */
const DELIVERED = new Set(["sent", "pending"]);

/** Chave única da pessoa: telefone normalizado (com 55), senão e-mail em minúsculas. Vazia = sem como contatar. */
export const customerKey = (phone?: string | null, email?: string | null): string => normPhone(phone) ?? normEmail(email) ?? "";

const sameInstant = (a?: string | null, b?: string | null) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

export function decideNext(p: {
  rows: ExecRow[]; steps: StepRef[]; maxCycles: number; inactivityDays: number; resendIntervalDays: number; lastOrderDate: string; now: Date;
}): Decision {
  if (!p.steps.length) return { send: false, reason: "sem passos" };
  const eps = p.rows.filter((r) => sameInstant(r.last_order_date, p.lastOrderDate));
  if (eps.some((r) => r.status === "unreachable")) return { send: false, reason: "numero sem WhatsApp" };
  if (p.maxCycles > 0 && eps.filter((r) => DELIVERED.has(r.status ?? "")).length >= p.maxCycles) return { send: false, reason: "limite de tentativas" };
  if (!eps.length) return { send: true, stepIndex: 0, attemptNo: 1 };

  const last = eps.reduce((m, r) => (new Date(r.created_at) > new Date(m.created_at) ? r : m));
  const daysSince = Math.floor((p.now.getTime() - new Date(last.created_at).getTime()) / DAY_MS);
  if (daysSince < 1) return { send: false, reason: "ja recebeu hoje" }; // nunca duas mensagens no mesmo dia, mesmo com espera 0 configurada

  const lastStep = last.cycle_step ?? 0;
  let idx = p.steps.findIndex((s) => s.step_number > lastStep);
  let required: number;
  if (idx === -1) {
    // acabaram os passos e o ciclo recomeça (limite ilimitado): só depois de outro período inteiro de inatividade, não no dia seguinte
    idx = 0;
    required = Math.max(p.steps[0].delay_days, p.resendIntervalDays, p.inactivityDays);
  } else {
    required = p.steps[idx].delay_days;
  }
  if (daysSince < required) return { send: false, reason: `espera de ${required} dias` };
  const attemptNo = Math.max(eps.length, ...eps.map((r) => r.attempt_no ?? 0)) + 1;
  return { send: true, stepIndex: idx, attemptNo };
}
