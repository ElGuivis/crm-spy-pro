import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { planReplyDelay } from "../_shared/bulk-reply-humanize.ts";

Deno.test("espera da resposta: dentro de [min,max], leitura antes da digitação, teto de 120 s", () => {
  for (const r of [0, 0.3, 0.7, 0.999]) {
    const p = planReplyDelay(30, 90, 80, () => r);
    assert(p.totalMs >= 30_000 && p.totalMs <= 90_000, `total ${p.totalMs}`);
    assert(p.readAtMs >= 0 && p.readAtMs + p.typingMs <= p.totalMs, JSON.stringify(p));
  }
  assertEquals(planReplyDelay(500, 900, 10, () => 1).totalMs, 120_000);
  assertEquals(planReplyDelay(60, 10, 10, () => 0.5).totalMs, 60_000); // máx menor que mín vira o mín
  const zero = planReplyDelay(0, 0, 200, () => 0.5);
  assertEquals([zero.totalMs, zero.typingMs, zero.readAtMs], [0, 0, 0]);
  assertEquals(planReplyDelay(null, null, 10, () => 0).totalMs, 30_000); // padrão 30–90
});
