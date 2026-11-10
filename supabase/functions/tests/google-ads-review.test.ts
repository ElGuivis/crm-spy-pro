import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reviewProposals, stem, type CampInfo, type OpenRec } from "../_shared/google-ads-review-rules.ts";

const C = (id: number, name: string, status: string, budgetBrl: number, days = 10): CampInfo =>
  ({ campaign_id: id, name, status, daily_budget_micros: budgetBrl * 1e6, days_with_spend_14d: days });
const R = (id: string, kind: string, campaign_id: number, budgetBrl?: number): OpenRec =>
  ({ id, kind, payload: { campaign_id, daily_budget_micros: budgetBrl === undefined ? null : budgetBrl * 1e6 } });
const ids = (b: Array<{ id: string }>) => b.map((x) => x.id).sort();

Deno.test("caso real de 10/11: pausar+reconstruir Camisetas, 37->38, 11->12 e Marca #2 -> so a reconstrucao sobra", () => {
  const camps = [
    C(1, "[PESQUISA] - CAMISETAS CHRONIC", "ENABLED", 17, 0), C(2, "[PESQUISA] - CHRONIC BRAND", "ENABLED", 37, 1),
    C(3, "Performace Max", "ENABLED", 11, 1), C(4, "[PESQUISA] - CHRONIC BRAND #2", "PAUSED", 190, 0),
  ];
  const recs = [R("pause", "pause_campaign", 1), R("rebuild", "rebuild_search_structure", 1), R("b38", "adjust_budget", 2, 38), R("p12", "adjust_budget", 3, 12), R("m2", "enable_campaign", 4, 15)];
  const out = reviewProposals(recs, camps);
  assertEquals(ids(out), ["b38", "m2", "p12", "pause"]);
  assert(out.find((x) => x.id === "pause")!.reason.includes("reconstruir"));
  assert(out.find((x) => x.id === "b38")!.reason.includes("pequena"));
  assert(out.find((x) => x.id === "m2")!.reason.includes("Duplica"));
});

Deno.test("ajuste grande com dados suficientes passa; com poucos dias e bloqueado", () => {
  const camps = [C(1, "A", "ENABLED", 30, 12), C(2, "B", "ENABLED", 30, 3)];
  assertEquals(reviewProposals([R("ok", "adjust_budget", 1, 45)], camps), []);
  const out = reviewProposals([R("novo", "adjust_budget", 2, 45)], camps);
  assertEquals(ids(out), ["novo"]);
  assert(out[0].reason.includes("3 de 7"));
});

Deno.test("mudanca de menos de R$ 3 e bloqueada mesmo sendo >10% em campanha pequena", () => {
  assertEquals(ids(reviewProposals([R("x", "adjust_budget", 1, 12)], [C(1, "A", "ENABLED", 10, 12)])), ["x"]);
});

Deno.test("pausar + ajustar a mesma campanha: vale o pausar", () => {
  const out = reviewProposals([R("pausa", "pause_campaign", 1), R("ajuste", "adjust_budget", 1, 60)], [C(1, "A", "ENABLED", 30, 12)]);
  assertEquals(ids(out), ["ajuste"]);
});

Deno.test("religar campanha que NAO duplica nenhuma ligada passa; stem ignora #n, acento e caixa", () => {
  assertEquals(reviewProposals([R("e", "enable_campaign", 4, 20)], [C(1, "[PESQUISA] - CHRONIC BRAND", "ENABLED", 37), C(4, "[PESQUISA] - BONES CHRONIC", "PAUSED", 100)]), []);
  assertEquals(stem("[PESQUISA] - Bonés  Chronic #12"), stem("[pesquisa] - bones chronic"));
});

Deno.test("proposta sem campanha conhecida ou de outro tipo nao e tocada", () => {
  assertEquals(reviewProposals([R("neg", "add_negative_keywords", 1), R("z", "adjust_budget", 99, 50)], [C(1, "A", "ENABLED", 10)]), []);
});
