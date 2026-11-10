import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { campaignReadiness, unreadyReasons, type Structure } from "../_shared/google-ads-readiness.ts";
import { buildStrategy } from "../_shared/google-ads-strategy-rules.ts";
import { buildInsights, type InsightsInput } from "../_shared/google-ads-insights-rules.ts";

const empty: Structure = { adGroups: [], ads: [], keywords: [], assetGroups: [] };
const search = { campaign_id: 1, channel_type: "SEARCH" };

Deno.test("Pesquisa pronta: grupo ligado com anuncio aprovado e palavra-chave no MESMO grupo", () => {
  const s: Structure = {
    adGroups: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED" }],
    ads: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", approval_status: "APPROVED" }],
    keywords: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", negative: false }], assetGroups: [],
  };
  assertEquals(campaignReadiness(search, s), { ready: true, reasons: [] });
});

Deno.test("caso real da Camisetas: grupo ligado, mas sem anuncio ligado e sem palavra-chave ligada", () => {
  const s: Structure = {
    adGroups: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED" }],
    ads: [{ campaign_id: 1, ad_group_id: 10, status: "PAUSED", approval_status: "APPROVED" }],
    keywords: [{ campaign_id: 1, ad_group_id: 10, status: "PAUSED", negative: false }], assetGroups: [],
  };
  const r = campaignReadiness(search, s);
  assertEquals(r.ready, false);
  assertEquals(r.reasons, ["nenhum anuncio ligado e aprovado", "nenhuma palavra-chave ligada"]);
});

Deno.test("anuncio reprovado nao conta; negativa nao conta como palavra-chave; grupos diferentes nao servem", () => {
  const base = { adGroups: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED" }, { campaign_id: 1, ad_group_id: 11, status: "ENABLED" }], assetGroups: [] };
  assertEquals(campaignReadiness(search, { ...base, ads: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", approval_status: "DISAPPROVED" }], keywords: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", negative: false }] }).ready, false);
  assertEquals(campaignReadiness(search, { ...base, ads: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", approval_status: "APPROVED" }], keywords: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", negative: true }] }).ready, false);
  const split = campaignReadiness(search, { ...base, ads: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED", approval_status: "APPROVED" }], keywords: [{ campaign_id: 1, ad_group_id: 11, status: "ENABLED", negative: false }] });
  assertEquals(split.reasons, ["os anuncios e as palavras-chave ligados estao em grupos diferentes"]);
});

Deno.test("sem estrutura sincronizada ou tipo nao verificado -> null (nao bloqueia nada)", () => {
  assertEquals(campaignReadiness(search, empty).ready, null);
  assertEquals(campaignReadiness({ campaign_id: 2, channel_type: "SHOPPING" }, empty).ready, null);
  assertEquals(campaignReadiness({ campaign_id: 3, channel_type: "PERFORMANCE_MAX" }, empty).ready, null);
});

Deno.test("Performance Max: precisa de grupo de recursos ligado", () => {
  const pmax = { campaign_id: 3, channel_type: "PERFORMANCE_MAX" };
  assertEquals(campaignReadiness(pmax, { ...empty, assetGroups: [{ campaign_id: 3, status: "ENABLED" }] }).ready, true);
  assertEquals(campaignReadiness(pmax, { ...empty, assetGroups: [{ campaign_id: 3, status: "REMOVED" }] }).ready, false);
});

Deno.test("estrategia: campanha boa que nao veicula fica fora do plano, com aviso, e a ligada sem estrutura vira pausa", () => {
  const R = (v: number) => v * 1_000_000;
  const now = new Date("2026-11-09T12:00:00Z");
  const report = buildStrategy({
    now, monthlyCapMicros: R(2000), minRoas: 4.5,
    campaigns: [
      { campaign_id: 1, name: "Marca", status: "ENABLED", channel_type: "SEARCH", daily_budget_micros: R(37) },
      { campaign_id: 2, name: "Camisetas", status: "ENABLED", channel_type: "SEARCH", daily_budget_micros: R(17) },
    ],
    lifetime: [
      { campaign_id: 1, cost_micros: R(5000), conversions_value: 35000, first_spend_date: "2025-01-01", last_spend_date: "2025-12-01" },
      { campaign_id: 2, cost_micros: R(5000), conversions_value: 33000, first_spend_date: "2025-01-01", last_spend_date: "2025-12-01" },
    ],
    monthly: [
      { campaign_id: 1, month: "2025-11-01", cost_micros: R(1000), conversions_value: 7000, days_with_spend: 30 },
      { campaign_id: 2, month: "2025-11-01", cost_micros: R(1000), conversions_value: 6600, days_with_spend: 30 },
    ],
    conversionActions: [], unready: new Map([[2, ["nenhum anuncio ligado e aprovado"]]]),
  });
  assert(report.warnings.some((w) => w.includes("Camisetas") && w.includes("nao consegue veicular")));
  const camis = report.plan.find((p) => p.campaign_id === 2)!;
  assertEquals(camis.action, "pause");
  assert(camis.why.includes("nao consegue veicular"));
  assert(report.plan.some((p) => p.campaign_id === 1 && p.action === "set_budget") || !report.plan.some((p) => p.campaign_id === 1));
});

Deno.test("descobertas: alerta de campanha ligada que nao veicula; so reprovado em campanha ligada conta como nao aprovado", () => {
  const input: InsightsInput = {
    now: new Date("2026-11-09T12:00:00Z"), minRoas: 4.5, brandTerms: [], split: null, zeroTerms: [], imprShare: [], devices: [], hours: [], geo: [], products: [], keywords: [],
    ads: [
      { campaign_id: 1, status: "ENABLED", ad_strength: null, approval_status: "UNKNOWN" },
      { campaign_id: 9, status: "ENABLED", ad_strength: "AVERAGE", approval_status: "DISAPPROVED" }, // campanha pausada
    ],
    campaigns: [{ campaign_id: 1, name: "Camisetas", status: "ENABLED", channel_type: "SEARCH" }, { campaign_id: 9, name: "Antiga", status: "PAUSED", channel_type: "SEARCH" }],
    structure: { adGroups: [{ campaign_id: 1, ad_group_id: 10, status: "ENABLED" }], ads: [], keywords: [], assetGroups: [] },
  };
  const r = buildInsights(input);
  assertEquals(r.ads.not_approved, 0);
  assertEquals(r.not_serving.map((n) => n.campaign), ["Camisetas"]);
  assert(r.findings.some((f) => f.id === "enabled_not_serving" && f.severity === "high"));
  assert(!r.findings.some((f) => f.id === "ads_not_approved"));
});
