import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeCampaign, buildStrategy, type CampaignInfo, type LifetimeRow, type MonthlyRow } from "../_shared/google-ads-strategy-rules.ts";

const NOW = new Date("2026-11-09T12:00:00Z");
const R = (v: number) => v * 1_000_000;

const campaigns: CampaignInfo[] = [
  { campaign_id: 1, name: "Marca", status: "PAUSED", channel_type: "SEARCH", daily_budget_micros: R(100) },
  { campaign_id: 2, name: "PMax", status: "ENABLED", channel_type: "PERFORMANCE_MAX", daily_budget_micros: R(400) },
  { campaign_id: 3, name: "Trafego Site", status: "PAUSED", channel_type: "SEARCH", daily_budget_micros: R(50) },
  { campaign_id: 4, name: "Teste pequeno", status: "PAUSED", channel_type: "SEARCH", daily_budget_micros: R(10) },
  { campaign_id: 5, name: "Antiga removida", status: "REMOVED", channel_type: "SEARCH", daily_budget_micros: R(10) },
  { campaign_id: 6, name: "Camisetas", status: "PAUSED", channel_type: "SEARCH", daily_budget_micros: R(40) },
];
const lifetime: LifetimeRow[] = [
  { campaign_id: 1, cost_micros: R(52588), conversions_value: 373362, first_spend_date: "2023-11-18", last_spend_date: "2025-05-20" },
  { campaign_id: 2, cost_micros: R(29061), conversions_value: 170868, first_spend_date: "2023-06-05", last_spend_date: "2026-01-13" },
  { campaign_id: 3, cost_micros: R(4860), conversions_value: 16593, first_spend_date: "2025-05-18", last_spend_date: "2025-11-29" },
  { campaign_id: 4, cost_micros: R(120), conversions_value: 900, first_spend_date: "2024-01-01", last_spend_date: "2024-01-10" },
  { campaign_id: 5, cost_micros: R(1148), conversions_value: 266, first_spend_date: "2021-07-07", last_spend_date: "2022-01-27" },
  { campaign_id: 6, cost_micros: R(11490), conversions_value: 76255, first_spend_date: "2021-08-04", last_spend_date: "2024-11-25" },
];
const m = (campaign_id: number, month: string, cost: number, rev: number, days = 28): MonthlyRow =>
  ({ campaign_id, month, cost_micros: R(cost), conversions_value: rev, days_with_spend: days });
const monthly: MonthlyRow[] = [
  m(1, "2025-03-01", 2000, 14000), m(1, "2025-04-01", 2000, 15000), m(1, "2025-05-01", 1000, 7000),
  m(2, "2025-10-01", 1500, 4000, 31), m(2, "2025-11-01", 1500, 9000, 30), m(2, "2025-12-01", 1000, 6000, 31),
  m(3, "2025-09-01", 1500, 4000), m(3, "2025-10-01", 1500, 3000), m(3, "2025-11-01", 1500, 9593),
  m(6, "2024-09-01", 500, 3000), m(6, "2024-10-01", 500, 1200), m(6, "2024-11-01", 500, 800),
  m(5, "2021-08-01", 1148, 266),
];

const input = { now: NOW, monthlyCapMicros: R(2000), minRoas: null, campaigns, lifetime, monthly, conversionActions: [] };

Deno.test("analyzeCampaign: marca forte e parada ha meses -> reativar, com ROAS e dormencia", () => {
  const a = analyzeCampaign(campaigns[0], lifetime[0], monthly.filter((x) => x.campaign_id === 1), 3, NOW);
  assertEquals(a.verdict, "reactivate");
  assertEquals(a.lifetime.roas, 7.1);
  assertEquals(a.recent.roas, 7.2);
  assert(a.dormant_days! > 500);
  assertEquals(a.avg_daily_spend_when_active, 59.52);
});

Deno.test("analyzeCampaign: ligada e boa -> running; REMOVED -> removed; pouco gasto -> insufficient", () => {
  assertEquals(analyzeCampaign(campaigns[1], lifetime[1], monthly.filter((x) => x.campaign_id === 2), 3, NOW).verdict, "running");
  assertEquals(analyzeCampaign(campaigns[4], lifetime[4], [], 3, NOW).verdict, "removed");
  assertEquals(analyzeCampaign(campaigns[3], lifetime[3], [], 3, NOW).verdict, "insufficient");
});

Deno.test("analyzeCampaign: foi bem na vida mas acabou mal -> test_small; ruim na vida -> keep_off", () => {
  const camisetas = analyzeCampaign(campaigns[5], lifetime[5], monthly.filter((x) => x.campaign_id === 6), 5, NOW);
  // vida 6,64x, ultimos 3 meses (5000/1500)=...
  assertEquals(camisetas.lifetime.roas, 6.64);
  assertEquals(camisetas.verdict, "test_small");
  const trafego = analyzeCampaign(campaigns[2], lifetime[2], monthly.filter((x) => x.campaign_id === 3), 4, NOW);
  assertEquals(trafego.verdict, "keep_off");
});

Deno.test("buildStrategy: teto de R$2000 -> R$65,78/dia dividido entre as aprovadas; o que esta ligado e fora do plano e pausado", () => {
  const r = buildStrategy(input);
  assertEquals(r.min_roas, 3);
  assertEquals(r.min_roas_is_provisional, true);
  assertEquals(r.daily_target, 65.79);
  const budgets = r.plan.filter((p) => p.action !== "pause");
  assert(budgets.length >= 1 && budgets.length <= 3);
  const total = budgets.reduce((s, p) => s + (p.daily_budget_micros ?? 0), 0);
  assert(total <= 65_789_473, `soma ${total} acima do teto diario`);
  assert(budgets.every((p) => (p.daily_budget_micros ?? 0) >= 10_000_000));
  // Marca (reativar) deve entrar como "enable"; PMax ja ligada recebe "set_budget" (ou sai se nao couber).
  const marca = r.plan.find((p) => p.campaign_id === 1);
  assertEquals(marca?.action, "enable");
  // Nenhuma campanha ligada pode ficar de fora do plano com orcamento antigo de R$400.
  const pmax = r.plan.find((p) => p.campaign_id === 2);
  assert(pmax !== undefined);
  assert(r.warnings.some((w) => w.includes("PROVISORIO")));
});

Deno.test("buildStrategy: sem teto nao calcula plano; com min_roas informado nao e provisorio", () => {
  const r = buildStrategy({ ...input, monthlyCapMicros: null, minRoas: 2.5 });
  assertEquals(r.plan.length, 0);
  assertEquals(r.min_roas, 2.5);
  assertEquals(r.min_roas_is_provisional, false);
  assert(r.warnings.some((w) => w.includes("Teto mensal")));
});

Deno.test("buildStrategy: alerta de conversoes que nao sao venda e GA4 oculto", () => {
  const r = buildStrategy({
    ...input,
    conversionActions: [
      { name: "Android installs", status: "ENABLED", category: "DOWNLOAD", primary_for_goal: true, include_in_conversions_metric: false },
      { name: "Compra", status: "ENABLED", category: "PURCHASE", primary_for_goal: true, include_in_conversions_metric: true },
      { name: "Use Chronic - GA4 (web) CompraUse", status: "HIDDEN", category: "PAGE_VIEW", primary_for_goal: false, include_in_conversions_metric: false },
    ],
  });
  assert(r.warnings.some((w) => w.includes("Android installs") && !w.includes("Compra;")));
  assert(r.warnings.some((w) => w.includes("GA4")));
});

Deno.test("buildStrategy: o relatorio compactado cabe no limite de 20 mil caracteres do payload", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ...campaigns[0], campaign_id: 100 + i, name: `Campanha ${i}` }));
  const life = many.map((c) => ({ ...lifetime[0], campaign_id: c.campaign_id }));
  const r = buildStrategy({ ...input, campaigns: many, lifetime: life, monthly: [] });
  assert(JSON.stringify({ ...r, campaigns: r.campaigns.slice(0, 12) }).length < 20000);
});

Deno.test("buildStrategy: campanha ja ligada com o orcamento do plano nao gera linha (nada a aplicar)", () => {
  const first = buildStrategy(input);
  const line = first.plan.find((p) => p.action === "set_budget")!;
  const already = campaigns.map((c) => c.campaign_id === line.campaign_id ? { ...c, daily_budget_micros: line.daily_budget_micros } : c);
  const second = buildStrategy({ ...input, campaigns: already });
  assertEquals(second.plan.some((p) => p.campaign_id === line.campaign_id), false);
});

Deno.test("meta propria da campanha (campaignMinRoas) vale mais que o minimo da conta", () => {
  const camp = { campaign_id: 7, name: "Marca", channel_type: "SEARCH", status: "ENABLED", daily_budget_micros: 30e6 };
  const life = { campaign_id: 7, cost_micros: 1000e6, conversions_value: 3500, first_spend_date: "2025-01-01", last_spend_date: "2026-11-01" };
  const months = [{ campaign_id: 7, month: "2026-10-01", cost_micros: 300e6, conversions_value: 1050, days_with_spend: 20 }];
  const run = (m?: Map<number, number>) => buildStrategy({ now: new Date("2026-11-10T12:00:00Z"), monthlyCapMicros: 2000e6, minRoas: 4, campaigns: [camp] as never, lifetime: [life] as never, monthly: months as never, conversionActions: [], campaignMinRoas: m })
    .campaigns.find((c) => c.campaign_id === 7)!.verdict;
  assertEquals(run(), "keep_off");                         // 3,5x < 4
  assertEquals(run(new Map([[7, 3]])), "running");         // meta propria 3 -> passa
});
