import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { customerKey, decideNext, type ExecRow } from "../reactivation-processor/state.ts";

const NOW = new Date("2026-12-20T15:00:00Z");
const LAST_ORDER = "2026-09-01T12:00:00Z";
const steps = [{ step_number: 1, delay_days: 0 }, { step_number: 2, delay_days: 40 }];
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const row = (over: Partial<ExecRow>): ExecRow => ({ created_at: ago(1), cycle_step: 1, last_order_date: LAST_ORDER, status: "sent", attempt_no: 1, ...over });
const base = { steps, maxCycles: 3, inactivityDays: 60, resendIntervalDays: 0, lastOrderDate: LAST_ORDER, now: NOW };

Deno.test("cliente novo na lista: passo 1, tentativa 1", () => {
  assertEquals(decideNext({ ...base, rows: [] }), { send: true, stepIndex: 0, attemptNo: 1 });
});

Deno.test("recebeu hoje: não manda de novo, mesmo com espera 0 no próximo passo", () => {
  const out = decideNext({ ...base, steps: [{ step_number: 1, delay_days: 0 }, { step_number: 2, delay_days: 0 }], rows: [row({ created_at: ago(0) })] });
  assertEquals(out, { send: false, reason: "ja recebeu hoje" });
});

Deno.test("passo 2 só depois da espera configurada", () => {
  assertEquals(decideNext({ ...base, rows: [row({ created_at: ago(10) })] }).send, false);
  assertEquals(decideNext({ ...base, rows: [row({ created_at: ago(41) })] }), { send: true, stepIndex: 1, attemptNo: 2 });
});

Deno.test("ilimitado: depois do último passo só recomeça depois de outro período de inatividade (antes disparava na hora)", () => {
  const rows = [row({ created_at: ago(70), cycle_step: 1, attempt_no: 1 }), row({ created_at: ago(30), cycle_step: 2, attempt_no: 2 })];
  assertEquals(decideNext({ ...base, maxCycles: 0, rows }).send, false); // 30 dias < 60
  const old = [row({ created_at: ago(120), cycle_step: 1, attempt_no: 1 }), row({ created_at: ago(61), cycle_step: 2, attempt_no: 2 })];
  assertEquals(decideNext({ ...base, maxCycles: 0, rows: old }), { send: true, stepIndex: 0, attemptNo: 3 });
});

Deno.test("limite de tentativas conta só o que foi entregue", () => {
  const sent = [1, 2, 3].map((n) => row({ created_at: ago(100 - n), attempt_no: n, cycle_step: n }));
  assertEquals(decideNext({ ...base, rows: sent }), { send: false, reason: "limite de tentativas" });
  const withFailed = [row({ created_at: ago(90), attempt_no: 1, status: "failed" }), row({ created_at: ago(80), attempt_no: 2, cycle_step: 2 })];
  // 1 entregue + 1 falha: ainda cabe mais 1 tentativa (a falha não consome o limite) e a numeração segue (tentativa 3)
  assertEquals(decideNext({ ...base, maxCycles: 2, rows: withFailed }), { send: true, stepIndex: 0, attemptNo: 3 });
});

Deno.test("execuções de outra compra (episódio antigo) não contam", () => {
  const oldEpisode = [row({ last_order_date: "2026-01-10T00:00:00Z", created_at: ago(5) })];
  assertEquals(decideNext({ ...base, rows: oldEpisode }), { send: true, stepIndex: 0, attemptNo: 1 });
});

Deno.test("número sem WhatsApp: nunca mais tenta neste episódio", () => {
  assertEquals(decideNext({ ...base, rows: [row({ status: "unreachable", created_at: ago(90) })] }), { send: false, reason: "numero sem WhatsApp" });
});

Deno.test("customerKey: telefone com 55 (inclusive DDD 55), senão e-mail minúsculo", () => {
  assertEquals(customerKey("(11) 99999-8888", "A@B.com"), "5511999998888");
  assertEquals(customerKey("55991234567", null), "5555991234567");
  assertEquals(customerKey("", "Maria@Exemplo.COM"), "maria@exemplo.com");
  assertEquals(customerKey(null, null), "");
});
