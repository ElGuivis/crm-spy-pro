/** Formato devolvido pela função google-ads-economics (o cálculo fica no servidor, uma única fonte da verdade). */
export interface EconomicsMetrics {
  orders_valid: number; orders_cancelled: number; orders_refunded: number; revenue_valid: number; revenue_refunded: number;
  avg_ticket: number | null; avg_discount: number | null; avg_shipping_charged: number | null; avg_units: number | null; avg_cogs: number | null;
  pct_units_without_cost: number | null; product_margin_pct: number | null; free_shipping_pct: number | null;
  cancel_pct: number | null; refund_pct: number | null; repeat_pct: number | null;
  payment_mix: Array<{ method: string; pct: number }>;
}
export interface EconomicsInputs { tax_pct: number; gateway_fee_pct: number; shipping_cost_ratio: number; confirmed: boolean }
export interface RoasTargets { min_roas: number; target_roas: number; alert_roas: number }
export interface BreakEven {
  contribution_pct: number | null; break_even_roas_crm: number | null; break_even_roas_google: number | null; max_cpa: number | null;
  refund_share_pct: number; profit_per_ad_real_at_min: number | null; warnings: string[];
}
export interface ReconRow {
  month: string; google_cost: number; google_conversions: number; google_value: number; crm_orders: number; crm_revenue: number;
  value_ratio: number | null; conv_ratio: number | null; roas_google: number | null; roas_crm: number | null; flag: "ok" | "over" | "no_ads";
}
export interface EconomicsView {
  metrics: EconomicsMetrics; inputs: EconomicsInputs; targets: RoasTargets; break_even: BreakEven;
  reconciliation: { rows: ReconRow[]; over_months: number; warning: string | null }; computed_at: string;
}

export const reais = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const x = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`);

/** Aceita "6", "6,5" e "6.5". Vazio ou inválido vira NaN. */
export function parseNumber(text: string): number {
  const s = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
