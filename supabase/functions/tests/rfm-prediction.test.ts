import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalCdf, predictRepurchase } from "../rfm-calculator/rfm-scoring.ts";

const now = new Date("2026-10-06T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

Deno.test("normalCdf: valores de referência", () => {
  assertAlmostEquals(normalCdf(0), 0.5, 1e-6);
  assertAlmostEquals(normalCdf(1.96), 0.975, 1e-3);
  assertAlmostEquals(normalCdf(-1.96), 0.025, 1e-3);
});

Deno.test("cliente perdido (recência > 2,5x o intervalo) não tem previsão", () => {
  // caso real: 753 dias sem comprar, intervalo médio de 106: antes dava 99%
  const p = predictRepurchase(daysAgo(753), 753, 106, 40, now);
  assertEquals(p.predicted_next_purchase_date, null);
  assertEquals(p.purchase_probability_30d, null);
  assertEquals(p.ideal_offer_window_end, null);
});

Deno.test("sem intervalo médio não há previsão", () => {
  assertEquals(predictRepurchase(daysAgo(10), 10, 0, null, now).purchase_probability_7d, null);
});

Deno.test("cliente dentro do ciclo: probabilidades crescem com a janela e ficam entre 1 e 99", () => {
  const p = predictRepurchase(daysAgo(90), 90, 100, 20, now);
  assert(p.purchase_probability_7d! >= 1 && p.purchase_probability_30d! <= 99);
  assert(p.purchase_probability_7d! <= p.purchase_probability_15d!);
  assert(p.purchase_probability_15d! <= p.purchase_probability_30d!);
  assertEquals(p.predicted_next_purchase_date, daysAgo(90 - 100).toISOString().split("T")[0]);
});

Deno.test("quanto mais atrasado (ainda dentro do limite), menor a chance de estar vivo", () => {
  const noPrazo = predictRepurchase(daysAgo(100), 100, 100, 20, now);
  const atrasado = predictRepurchase(daysAgo(200), 200, 100, 20, now);
  assert(atrasado.purchase_probability_30d! < noPrazo.purchase_probability_30d!);
});

Deno.test("ninguém passa de 99%", () => {
  const p = predictRepurchase(daysAgo(120), 120, 100, 10, now);
  assert(p.purchase_probability_30d! <= 99);
});
