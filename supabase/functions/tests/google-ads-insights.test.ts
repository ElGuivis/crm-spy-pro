import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildInsights, type InsightsInput } from "../_shared/google-ads-insights-rules.ts";
import { resolveBrandTerms } from "../_shared/google-ads-insights-runner.ts";

const R = (v: number) => v * 1_000_000;
const base: InsightsInput = {
  now: new Date("2026-11-09T12:00:00Z"), minRoas: 4.5, brandTerms: ["chronic", "cronic"],
  split: { total_cost: R(80729), total_value: 507739, total_conversions: 3929, brand_cost: R(75933), brand_value: 494719, brand_conversions: 3782, zero_conv_cost: R(6093), zero_conv_terms: 3658 },
  zeroTerms: [{ search_term: "roupa chronic", cost_micros: R(63), clicks: 248, impressions: 1777 }, { search_term: "barato", cost_micros: R(5), clicks: 3, impressions: 9 }],
  imprShare: [
    { campaign_id: 1, month: "2025-10-01", impressions: 1000, search_impression_share: 0.4, search_budget_lost_share: 0.03, search_rank_lost_share: 0.57 },
    { campaign_id: 1, month: "2025-11-01", impressions: 1000, search_impression_share: 0.42, search_budget_lost_share: 0.03, search_rank_lost_share: 0.55 },
    { campaign_id: 2, month: "2025-11-01", impressions: 500, search_impression_share: 0.5, search_budget_lost_share: 0.3, search_rank_lost_share: 0.1 },
    { campaign_id: 3, month: "2025-11-01", impressions: 0, search_impression_share: null, search_budget_lost_share: null, search_rank_lost_share: null },
  ],
  devices: [
    { device: "MOBILE", month: "2025-01-01", cost_micros: R(98391), conversions_value: 601000 },
    { device: "DESKTOP", month: "2025-01-01", cost_micros: R(32404), conversions_value: 147000 },
    { device: "TABLET", month: "2025-01-01", cost_micros: R(50), conversions_value: 0 },
  ],
  hours: [
    { year: 2025, day_of_week: "MONDAY", hour: 20, cost_micros: R(3000), conversions_value: 21000 },
    { year: 2025, day_of_week: "THURSDAY", hour: 20, cost_micros: R(3000), conversions_value: 14000 },
    { year: 2025, day_of_week: "WEDNESDAY", hour: 3, cost_micros: R(300), conversions_value: 3000 },
    { year: 2025, day_of_week: "FRIDAY", hour: 5, cost_micros: R(2000), conversions_value: 2000 },
    { year: 2020, day_of_week: "SUNDAY", hour: 1, cost_micros: R(9999), conversions_value: 0 },
  ],
  geo: [{ region_key: "20106", region_name: "State of Sao Paulo,Brazil", cost_micros: R(48031), conversions_value: 278000 }],
  products: [
    { item_id: "a", title: "Camiseta Bike Night", cost_micros: R(991), conversions_value: 3532, conversions: 20 },
    { item_id: "b", title: "Meia sem venda", cost_micros: R(120), conversions_value: 0, conversions: 0 },
    { item_id: "c", title: "Gasto pequeno", cost_micros: R(10), conversions_value: 0, conversions: 0 },
  ],
  keywords: [
    { text: "chronic", match_type: "EXACT", status: "ENABLED", negative: false, quality_score: 3, cost_micros: R(500), conversions: 5, conversions_value: 900 },
    { text: "loja de roupa", match_type: "BROAD", status: "ENABLED", negative: false, quality_score: null, cost_micros: R(300), conversions: 0, conversions_value: 0 },
  ],
  ads: [{ status: "ENABLED", ad_strength: "POOR", approval_status: "APPROVED" }, { status: "ENABLED", ad_strength: "GOOD", approval_status: "DISAPPROVED" }],
  campaigns: [{ campaign_id: 1, name: "Marca", status: "ENABLED" }, { campaign_id: 2, name: "Camisetas", status: "PAUSED" }, { campaign_id: 3, name: "Sem dado", status: "PAUSED" }],
};

Deno.test("dependencia de marca: calcula participacao e ROAS de marca x demais", () => {
  const r = buildInsights(base);
  assertEquals(r.brand?.share_of_revenue, 0.974);
  assertEquals(r.brand?.roas, 6.52);
  assertEquals(r.brand?.non_brand_cost, 4796);
  assertEquals(r.brand?.non_brand_roas, 2.71);
  const f = r.findings.find((x) => x.id === "brand_dependence")!;
  assertEquals(f.severity, "high");
  assert(f.title.includes("97%"));
  assert(r.findings.some((x) => x.id === "non_brand_weak"));
});

Deno.test("sem termos de marca definidos nao inventa dependencia", () => {
  const r = buildInsights({ ...base, brandTerms: [], split: { ...base.split!, brand_cost: 0, brand_value: 0 } });
  assertEquals(r.brand, null);
  assert(!r.findings.some((x) => x.id === "brand_dependence"));
});

Deno.test("termos sem conversao: so os com gasto minimo viram candidatos a negativar", () => {
  const r = buildInsights(base);
  assertEquals(r.waste.top.map((t) => t.term), ["roupa chronic"]);
  assertEquals(r.waste.terms, 3658);
  assert(r.findings.some((x) => x.id === "negative_candidates"));
});

Deno.test("participacao de impressoes: limite por ranking x orcamento; meses sem impressao ignorados", () => {
  const r = buildInsights(base);
  const marca = r.impression_share.find((x) => x.campaign === "Marca")!;
  assertEquals(marca.limit, "rank");
  assertEquals(r.impression_share.find((x) => x.campaign === "Camisetas")!.limit, "budget");
  assert(!r.impression_share.some((x) => x.campaign === "Sem dado"));
  assert(r.findings.some((x) => x.id === "rank_limited"));
});

Deno.test("dispositivo e dia da semana: so compara segmentos com gasto minimo e usa os 2 anos mais recentes", () => {
  const r = buildInsights(base);
  assertEquals(r.devices.map((d) => d.device), ["celular", "computador"]);
  const dev = r.findings.find((x) => x.id === "device_skew")!;
  assert(dev.title.includes("celular"));
  // 2020 (gasto 9999, ROAS 0) e ignorado: fora dos 2 anos mais recentes.
  assert(!r.weekdays.some((d) => d.day === "domingo"));
  assertEquals(r.hours.best[0].hour, 3);
});

Deno.test("produtos, palavras-chave e anuncios: achados com limiares", () => {
  const r = buildInsights(base);
  assertEquals(r.products.top[0].title, "Camiseta Bike Night");
  assertEquals(r.products.waste.map((p) => p.title), ["Meia sem venda"]);
  assertEquals(r.keywords.low_quality[0], { text: "chronic", score: 3, cost: 500 });
  assertEquals(r.keywords.waste.map((k) => k.text), ["loja de roupa"]);
  assertEquals(r.ads, { total: 2, weak: 1, not_approved: 1 });
  assert(r.findings.some((x) => x.id === "ads_not_approved" && x.severity === "high"));
});

Deno.test("achados vem ordenados por gravidade e o relatorio cabe no limite de 20 mil caracteres", () => {
  const r = buildInsights(base);
  const sev = r.findings.map((f) => f.severity);
  assertEquals(sev, [...sev].sort((a, b) => ({ high: 0, medium: 1, low: 2, info: 3 }[a] - { high: 0, medium: 1, low: 2, info: 3 }[b])));
  assert(JSON.stringify({ report: r }).length < 20000);
});

Deno.test("resolveBrandTerms: usa os termos informados; senao a 1a palavra do nome da conta (sem acento)", () => {
  assertEquals(resolveBrandTerms({ brand_terms: [" Chronic ", "cronic", "x"] }, "Qualquer"), ["chronic", "cronic"]);
  assertEquals(resolveBrandTerms({}, "Chronic Ação"), ["chronic"]);
  assertEquals(resolveBrandTerms({}, null), []);
  assertEquals(resolveBrandTerms({ brand_terms: [] }, "Chronic"), []);
});
