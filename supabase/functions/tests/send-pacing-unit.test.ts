import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gapMs, idealGapMs, paceQuota, windowRemainingMs } from "../_shared/send-pacing.ts";

const at = (h: number, m = 0) => new Date(`2026-11-10T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
const MIN = 60_000;

Deno.test("janela: o que resta ate as 21h", () => {
  assertEquals(windowRemainingMs(at(15)), 6 * 60 * MIN);
  assertEquals(windowRemainingMs(at(21)), 0);
});
Deno.test("intervalo ideal = tempo restante / pendentes", () => {
  assertEquals(idealGapMs(18, at(15)), 20 * MIN);
  assertEquals(idealGapMs(0, at(15)), Infinity);
});
Deno.test("lista pequena: 1 por vez, espacada ate o fim do dia", () => {
  // 18 pendentes as 15h: intervalo ideal 20 min
  assertEquals(paceQuota(18, null, at(15)), 1); // primeiro envio do dia: sai agora
  assertEquals(paceQuota(18, at(15, 0), at(15, 10)), 0); // 10 min depois: ainda nao
  assertEquals(paceQuota(18, at(15, 0), at(15, 20)), 1); // 20 min depois: libera 1
  assertEquals(paceQuota(18, at(15, 0), at(15, 17)), 1); // tolera chegar ate 5 min antes
  assertEquals(paceQuota(18, at(15, 0), at(15, 14)), 0);
});
Deno.test("poucos pendentes: espaca ainda mais", () => {
  assertEquals(paceQuota(3, at(15, 0), at(16, 0)), 0); // ideal = 2h
  assertEquals(paceQuota(3, at(15, 0), at(17, 0)), 1);
});
Deno.test("lista grande: mais de 1 por execucao", () => {
  // 120 pendentes as 15h: ideal 3 min -> 3 por execucao de 10 min
  assertEquals(paceQuota(120, at(14, 50), at(15, 0)), 3);
});
Deno.test("sem pendencia, nada", () => {
  assertEquals(paceQuota(0, null, at(15)), 0);
});
Deno.test("intervalo dentro da execucao se ajusta a cota", () => {
  assertEquals(gapMs(1), 14_000);
  assertEquals(gapMs(10), 10_000);
  assertEquals(gapMs(40), 3_000);
});
