import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeBreakEven, DEFAULT_INPUTS, reconcile, validateEconomicsInputs, validateTargets, type EconomicsMetrics } from "../_shared/google-ads-economics-core.ts";

// Numeros reais medidos no CRM da Chronic (24 meses, 2026-11-10).
const REAL: EconomicsMetrics = {
  orders_valid: 1474, orders_cancelled: 1164, orders_refunded: 48, revenue_valid: 241172.22, revenue_refunded: 13504.86,
  avg_ticket: 163.62, avg_discount: 11.72, avg_shipping_charged: 22.96, avg_units: 1.86, avg_cogs: 74.46,
  pct_units_without_cost: 0.1, product_margin_pct: 47.1, free_shipping_pct: 4.5, cancel_pct: 43.3, refund_pct: 3.2, repeat_pct: 9.1, payment_mix: [],
};

Deno.test("ponto de equilibrio com os numeros reais: 2,63 no CRM e 2,78 no Google, sem imposto", () => {
  const b = computeBreakEven(REAL, DEFAULT_INPUTS, 4);
  assertEquals(b.contribution_pct, 38);
  assertEquals(b.break_even_roas_crm, 2.63);
  assertEquals(b.break_even_roas_google, 2.78);
  assertEquals(b.max_cpa, 62.11);
  assert(b.warnings.some((w) => w.includes("estimativas")), "avisa que imposto/taxa/frete nao foram confirmados");
});

Deno.test("imposto de 8% sobe o ponto de equilibrio para ~3,4 e o lucro no ROAS minimo cai", () => {
  const b = computeBreakEven(REAL, { tax_pct: 8, gateway_fee_pct: 2.5, shipping_cost_ratio: 1, confirmed: true }, 4);
  assertEquals(b.break_even_roas_crm, 3.34);
  assertEquals(b.break_even_roas_google, 3.52);
  assert(b.warnings.length === 0);
  assert((b.profit_per_ad_real_at_min ?? 0) > 0, "ROAS 4 ainda da lucro");
});

Deno.test("frete pago maior que o cobrado e margem sem custo cadastrado geram avisos; margem negativa nao calcula", () => {
  const caro = computeBreakEven({ ...REAL, pct_units_without_cost: 12 }, { ...DEFAULT_INPUTS, shipping_cost_ratio: 2 }, 4);
  assert(caro.warnings.some((w) => w.includes("sem custo cadastrado")));
  assertEquals(caro.contribution_pct, 23.9);
  const ruim = computeBreakEven({ ...REAL, avg_cogs: 150 }, DEFAULT_INPUTS, 4);
  assertEquals(ruim.break_even_roas_crm, null);
  assert(ruim.warnings.some((w) => w.includes("nenhuma campanha se paga")));
  const vazio = computeBreakEven({ ...REAL, avg_ticket: null }, DEFAULT_INPUTS, 4);
  assertEquals(vazio.contribution_pct, null);
});

Deno.test("validacao dos numeros do dono e das metas de ROAS", () => {
  assertEquals(validateEconomicsInputs({ tax_pct: 6, gateway_fee_pct: 3, shipping_cost_ratio: 1.1 }), { ok: true, value: { tax_pct: 6, gateway_fee_pct: 3, shipping_cost_ratio: 1.1, confirmed: true } });
  assert(!validateEconomicsInputs({ tax_pct: 60, gateway_fee_pct: 3, shipping_cost_ratio: 1 }).ok);
  assert(!validateEconomicsInputs({ tax_pct: "6", gateway_fee_pct: 3, shipping_cost_ratio: 1 }).ok);
  assertEquals(validateTargets({ min_roas: 4, target_roas: 5, alert_roas: 3 }), { ok: true, value: { min_roas: 4, target_roas: 5, alert_roas: 3 } });
  assert(!validateTargets({ min_roas: 4, target_roas: 3, alert_roas: 3 }).ok, "alvo menor que o minimo");
  assert(!validateTargets({ min_roas: 4, target_roas: 5, alert_roas: 4.5 }).ok, "alerta acima do minimo");
  assert(!validateTargets({ min_roas: 0.1, target_roas: 5, alert_roas: 0.1 }).ok);
});

Deno.test("conciliacao: Google acima do CRM e marcado; mes sem anuncio nao conta", () => {
  const r = reconcile([
    { month: "2025-01-01", google_cost: 1000, google_conversions: 100, google_value: 6000, crm_orders: 95, crm_revenue: 5800 },
    { month: "2025-02-01", google_cost: 1000, google_conversions: 150, google_value: 8000, crm_orders: 100, crm_revenue: 6000 },
    { month: "2025-03-01", google_cost: 0, google_conversions: 0, google_value: 0, crm_orders: 10, crm_revenue: 900 },
  ]);
  assertEquals(r.rows.map((x) => x.flag), ["ok", "over", "no_ads"]);
  assertEquals(r.over_months, 1);
  assertEquals(r.rows[1].roas_google, 8);
  assertEquals(r.rows[1].roas_crm, 6);
  assert(r.warning?.includes("1 mes"));
  assertEquals(reconcile([]).warning, null);
});
