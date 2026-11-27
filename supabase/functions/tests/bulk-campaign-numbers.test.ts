import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { campaignNumberIds, rotationOrder, speedFactor } from "../bulk-campaign-processor/numbers.ts";

const base = { id: "c", daily_limit: null, daily_limit_step: 0, last_integration_id: null };

Deno.test("lista de números: usa a lista; sem lista cai no número antigo; tira repetidos", () => {
  assertEquals(campaignNumberIds({ ...base, whatsapp_integration_id: "a", whatsapp_integration_ids: ["b", "c", "b"] }), ["b", "c"]);
  assertEquals(campaignNumberIds({ ...base, whatsapp_integration_id: "a", whatsapp_integration_ids: null }), ["a"]);
  assertEquals(campaignNumberIds({ ...base, whatsapp_integration_id: "a", whatsapp_integration_ids: [] }), ["a"]);
  assertEquals(campaignNumberIds({ ...base, whatsapp_integration_id: null, whatsapp_integration_ids: null }), []);
});

Deno.test("revezamento: começa no número seguinte ao último tentado", () => {
  assertEquals(rotationOrder(["a", "b", "c"], null), ["a", "b", "c"]);
  assertEquals(rotationOrder(["a", "b", "c"], "a"), ["b", "c", "a"]);
  assertEquals(rotationOrder(["a", "b", "c"], "c"), ["a", "b", "c"]);
  assertEquals(rotationOrder(["a", "b", "c"], "x"), ["a", "b", "c"]); // número tirado da lista
  assertEquals(rotationOrder(["a"], "a"), ["a"]);
});

import { pickVariant } from "../_shared/spintax.ts";

Deno.test("variações completas: sorteia entre a principal e as variações, ignorando vazias", () => {
  assertEquals(pickVariant("A", ["B", " ", "C"], () => 0), "A");
  assertEquals(pickVariant("A", ["B", " ", "C"], () => 0.5), "B");
  assertEquals(pickVariant("A", ["B", " ", "C"], () => 0.99), "C");
  assertEquals(pickVariant("A", null, () => 0.99), "A");
  assertEquals(pickVariant("A", [], () => 0.5), "A");
});

Deno.test("velocidade: +50% por número disponível; cada número nunca passa do intervalo configurado", () => {
  assertEquals(speedFactor(0), 1);
  assertEquals(speedFactor(1), 1);
  assertEquals(speedFactor(2), 1.5);
  assertEquals(speedFactor(3), 2);
  assertEquals(speedFactor(4), 2.5);
  for (let n = 1; n <= 20; n++) {
    // intervalo de cada número = intervalo da campanha × n / fator, tem de ser >= 1×
    if (n / speedFactor(n) < 1) throw new Error(`número ${n} enviaria rápido demais`);
  }
});
