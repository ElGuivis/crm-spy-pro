import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  activeAccountBudget,
  avgDailySpend,
  brl,
  runDiagnosis,
  type RuleCampaign,
  type RuleDaily,
  type RuleInput,
} from "../_shared/google-ads-diagnosis-rules.ts";

const NOW = new Date("2026-11-09T12:00:00Z");
const MICROS = 1_000_000;
const R = (n: number) => Math.round(n * MICROS);

// Estado real da conta em 2026-11-09 (ver docs/google-ads-agentes.md, secao 1)
const PMAX: RuleCampaign = { campaign_id: 20250099290, name: "Performace Max", status: "ENABLED", serving_status: "SUSPENDED", daily_budget_micros: R(400) };
const BRAND: RuleCampaign = { campaign_id: 23149476613, name: "[PESQUISA] - CHRONIC BRAND #2", status: "ENABLED", serving_status: "SUSPENDED", daily_budget_micros: R(190) };
const EXHAUSTED = { status: "APPROVED", approved_spending_limit_micros: R(131470.09), adjusted_spending_limit_micros: R(131520.33), amount_served_micros: R(131520.33) };

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    now: NOW,
    accountId: "acc1",
    account: { customer_status: "ENABLED", billing_status: "APPROVED", last_synced_at: "2026-11-09T11:00:00Z", guardrails: {} },
    campaigns: [PMAX, BRAND],
    accountBudgets: [EXHAUSTED],
    daily: [],
    ...over,
  };
}
const rules = (i: RuleInput) => runDiagnosis(i).map((f) => f.rule);

Deno.test("R1: estado real da conta (saldo = limite, campanhas SUSPENDED) gera alerta critico de saldo esgotado", () => {
  const f = runDiagnosis(input()).find((x) => x.rule === "R1")!;
  assertEquals(f.severity, "critical");
  assertEquals(f.kind, "manual_action");
  assertEquals(f.risk, "high");
  assertStringIncludes(f.rationale, "R$ 131.520,33");
  assertStringIncludes(f.rationale, "Performace Max");
  assertStringIncludes(f.rationale, "UNKNOWN"); // admite que a causa e inferida
  assertEquals((f.payload.campaigns as number[]).length, 2);
});

Deno.test("R1: conta com limite folgado e campanhas entregando NAO alerta", () => {
  const serving = [{ ...PMAX, serving_status: "SERVING" }];
  const ok = { ...EXHAUSTED, amount_served_micros: R(100000) };
  assertEquals(rules(input({ campaigns: serving, accountBudgets: [ok] })).filter((r) => r === "R1" || r === "R2"), []);
});

Deno.test("R1: sem orcamento da conta (outro tipo de pagamento) nao calcula R1/R2", () => {
  assertEquals(rules(input({ accountBudgets: [] })).filter((r) => r === "R1" || r === "R2"), []);
});

Deno.test("R2: retroteste - R$ 500 restantes com gasto de ~R$ 200/dia avisa 'alto' ANTES de esgotar", () => {
  const lastDays: RuleDaily[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(NOW.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    lastDays.push({ campaign_id: 1, date: d, impressions: 1000, cost_micros: R(200) });
  }
  const budget = { ...EXHAUSTED, amount_served_micros: R(131520.33 - 500) }; // restam R$ 500
  const f = runDiagnosis(input({
    campaigns: [{ ...PMAX, serving_status: "SERVING" }], accountBudgets: [budget], daily: lastDays,
  })).find((x) => x.rule === "R2")!;
  assertEquals(f.severity, "high"); // 2,5 dias
  assertEquals(f.payload.days_left, 2.5);
  assertEquals(rules(input({ campaigns: [{ ...PMAX, serving_status: "SERVING" }], accountBudgets: [budget], daily: lastDays })).includes("R1"), false);
});

Deno.test("R2: severidade por faixa de dias (<=1 critico, <=3 alto, <=7 medio, >7 nada) e sem gasto nao preve", () => {
  const spend = (perDay: number): RuleDaily[] =>
    Array.from({ length: 7 }, (_, i) => ({ campaign_id: 1, date: new Date(NOW.getTime() - (i + 1) * 86_400_000).toISOString().slice(0, 10), impressions: 1, cost_micros: R(perDay) }));
  const sev = (remaining: number, perDay: number) =>
    runDiagnosis(input({ campaigns: [], accountBudgets: [{ ...EXHAUSTED, amount_served_micros: R(131520.33 - remaining) }], daily: spend(perDay) }))
      .find((f) => f.rule === "R2")?.severity;
  assertEquals(sev(100, 200), "critical"); // 0,5 dia
  assertEquals(sev(500, 200), "high");     // 2,5
  assertEquals(sev(1200, 200), "medium");  // 6
  assertEquals(sev(5000, 200), undefined); // 25
  assertEquals(sev(500, 0), undefined);    // sem gasto: sem previsao
});

Deno.test("R3: ativa, entregando, com orcamento e 0 impressoes em 7 dias alerta; com impressoes nao", () => {
  const serving = { ...PMAX, serving_status: "SERVING" };
  const noBudget = { ...EXHAUSTED, amount_served_micros: 0 };
  assertEquals(rules(input({ campaigns: [serving], accountBudgets: [noBudget] })).includes("R3"), true);
  const withImp: RuleDaily[] = [{ campaign_id: serving.campaign_id, date: "2026-11-08", impressions: 50, cost_micros: R(5) }];
  assertEquals(rules(input({ campaigns: [serving], accountBudgets: [noBudget], daily: withImp })).includes("R3"), false);
  // suspensa nao dispara R3 (a causa ja e outra)
  assertEquals(rules(input({ campaigns: [PMAX], accountBudgets: [noBudget] })).includes("R3"), false);
});

Deno.test("R4: faturamento ou conta com status ruim e critico; status nulo (nao sincronizado) nao dispara", () => {
  assertEquals(rules(input({ account: { ...input().account, billing_status: "PENDING" } })).includes("R4"), true);
  assertEquals(rules(input({ account: { ...input().account, customer_status: "SUSPENDED" } })).includes("R4"), true);
  assertEquals(rules(input({ account: { ...input().account, billing_status: null, customer_status: null } })).includes("R4"), false);
});

Deno.test("R7: orcamentos diarios (R$ 590/dia) acima do teto mensal de R$ 1.000 alertam com os numeros", () => {
  const f = runDiagnosis(input({ account: { ...input().account, guardrails: { monthly_budget_cap_micros: R(1000) } } })).find((x) => x.rule === "R7")!;
  assertEquals(f.severity, "high");
  assertStringIncludes(f.rationale, "R$ 590,00/dia");
  assertStringIncludes(f.rationale, "R$ 1.000,00");
  assertEquals(f.payload.projected_monthly_micros, Math.round(R(590) * 30.4));
  // dentro do teto: nada
  const small = [{ ...PMAX, daily_budget_micros: R(20) }, { ...BRAND, daily_budget_micros: R(10) }];
  assertEquals(rules(input({ campaigns: small, account: { ...input().account, guardrails: { monthly_budget_cap_micros: R(1000) } } })).includes("R7"), false);
  // sem teto definido: nada
  assertEquals(rules(input()).includes("R7"), false);
});

Deno.test("R6: dado com mais de 36 h (ou nunca sincronizado) avisa", () => {
  assertEquals(rules(input({ account: { ...input().account, last_synced_at: "2026-11-07T00:00:00Z" } })).includes("R6"), true);
  assertEquals(rules(input({ account: { ...input().account, last_synced_at: null } })).includes("R6"), true);
  assertEquals(rules(input()).includes("R6"), false);
});

Deno.test("resultado vem ordenado por gravidade e cada achado tem chave de deduplicacao unica", () => {
  const all = runDiagnosis(input({ account: { ...input().account, billing_status: "PENDING", guardrails: { monthly_budget_cap_micros: R(1000) }, last_synced_at: null } }));
  const order = ["critical", "high", "medium", "low"];
  const idx = all.map((f) => order.indexOf(f.severity));
  assertEquals(idx, [...idx].sort((a, b) => a - b));
  assertEquals(new Set(all.map((f) => f.dedupe_key)).size, all.length);
});

Deno.test("activeAccountBudget: ignora nao aprovados e escolhe o de maior limite; avgDailySpend conta dias sem gasto", () => {
  assertEquals(activeAccountBudget([{ ...EXHAUSTED, status: "PENDING" }]), null);
  const big = { ...EXHAUSTED, adjusted_spending_limit_micros: R(500000) };
  assertEquals(activeAccountBudget([EXHAUSTED, big]), big);
  const d: RuleDaily[] = [{ campaign_id: 1, date: "2026-11-08", impressions: 1, cost_micros: R(70) }];
  assertEquals(avgDailySpend(d, NOW), R(10)); // R$ 70 em 7 dias
  assertEquals(brl(R(1234.5)), "R$ 1.234,50");
});
