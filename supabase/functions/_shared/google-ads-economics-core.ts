/**
 * Economia real da loja (funcoes puras, sem rede). Os numeros medidos vem do CRM (RPC google_ads_crm_economics);
 * so imposto, taxa de gateway e custo de frete vem do dono, porque o CRM nao sabe.
 */

export interface EconomicsMetrics {
  orders_valid: number; orders_cancelled: number; orders_refunded: number;
  revenue_valid: number; revenue_refunded: number;
  avg_ticket: number | null; avg_discount: number | null; avg_shipping_charged: number | null; avg_units: number | null; avg_cogs: number | null;
  pct_units_without_cost: number | null; product_margin_pct: number | null; free_shipping_pct: number | null;
  cancel_pct: number | null; refund_pct: number | null; repeat_pct: number | null;
  payment_mix: Array<{ method: string; pct: number }>;
}

export interface EconomicsInputs {
  tax_pct: number;            // imposto sobre a venda (% da receita)
  gateway_fee_pct: number;    // taxa media de pagamento (% da receita)
  shipping_cost_ratio: number; // frete que a loja PAGA / frete que cobra do cliente (1 = empata)
  confirmed: boolean;         // o dono ja revisou esses tres numeros?
}

export const DEFAULT_INPUTS: EconomicsInputs = { tax_pct: 0, gateway_fee_pct: 2.5, shipping_cost_ratio: 1, confirmed: false };

export interface RoasTargets { min_roas: number; target_roas: number; alert_roas: number }
export const DEFAULT_TARGETS: RoasTargets = { min_roas: 4, target_roas: 5, alert_roas: 3 };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida o que o dono digitou (faixas realistas: um erro de digitacao distorce todas as metas). */
export function validateEconomicsInputs(raw: unknown): Checked<EconomicsInputs> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tax = num(r.tax_pct), fee = num(r.gateway_fee_pct), ship = num(r.shipping_cost_ratio);
  if (tax === null || tax < 0 || tax > 40) return { ok: false, error: "Imposto deve ser um numero de 0 a 40 (%)" };
  if (fee === null || fee < 0 || fee > 15) return { ok: false, error: "Taxa de pagamento deve ser de 0 a 15 (%)" };
  if (ship === null || ship < 0 || ship > 2) return { ok: false, error: "Custo de frete deve ser de 0 a 2 (vezes o frete cobrado)" };
  return { ok: true, value: { tax_pct: round(tax), gateway_fee_pct: round(fee), shipping_cost_ratio: round(ship), confirmed: true } };
}

/** Metas de ROAS: alerta <= minimo <= alvo, todos entre 0,5 e 50. */
export function validateTargets(raw: unknown): Checked<RoasTargets> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const min = num(r.min_roas), target = num(r.target_roas), alert = num(r.alert_roas);
  if (min === null || target === null || alert === null) return { ok: false, error: "Informe minimo, alvo e alerta de ROAS" };
  if ([min, target, alert].some((x) => x < 0.5 || x > 50)) return { ok: false, error: "ROAS deve estar entre 0,5 e 50" };
  if (!(alert <= min && min <= target)) return { ok: false, error: "Use alerta <= minimo <= alvo" };
  return { ok: true, value: { min_roas: round(min), target_roas: round(target), alert_roas: round(alert) } };
}

export interface BreakEven {
  contribution_pct: number | null;      // lucro por R$ 100 vendidos, depois de produto, frete, taxa e imposto
  break_even_roas_crm: number | null;   // ROAS (receita da loja / gasto) em que o anuncio empata
  break_even_roas_google: number | null; // idem, na receita que o Google conta (inclui o que depois e devolvido)
  max_cpa: number | null;               // quanto pode custar uma venda sem dar prejuizo
  refund_share_pct: number;
  profit_per_ad_real_at_min: number | null; // lucro por R$ 1 de anuncio no ROAS minimo
  warnings: string[];
}

export function computeBreakEven(m: EconomicsMetrics, inputs: EconomicsInputs, minRoas: number): BreakEven {
  const warnings: string[] = [];
  const t = m.avg_ticket, c = m.avg_cogs, s = m.avg_shipping_charged ?? 0;
  const base: BreakEven = { contribution_pct: null, break_even_roas_crm: null, break_even_roas_google: null, max_cpa: null, refund_share_pct: 0, profit_per_ad_real_at_min: null, warnings };
  if (!t || t <= 0 || c === null) { warnings.push("Sem pedidos suficientes no CRM para calcular."); return base; }
  if (m.orders_valid < 100) warnings.push("Menos de 100 pedidos validos na janela: numeros pouco confiaveis.");
  if ((m.pct_units_without_cost ?? 0) > 5) warnings.push(`${m.pct_units_without_cost}% das pecas vendidas estao sem custo cadastrado: a margem pode estar inflada.`);
  if (!inputs.confirmed) warnings.push("Imposto, taxa de pagamento e frete sao estimativas: confirme-os para fixar o ponto de equilibrio.");

  const profit = t - c - s * inputs.shipping_cost_ratio;
  const contribution = (profit / t) * 100 - inputs.gateway_fee_pct - inputs.tax_pct;
  const refundShare = m.revenue_valid + m.revenue_refunded > 0 ? m.revenue_refunded / (m.revenue_valid + m.revenue_refunded) : 0;
  if (contribution <= 0) { warnings.push("Margem de contribuicao zero ou negativa: nenhuma campanha se paga."); return { ...base, contribution_pct: round(contribution, 1), refund_share_pct: round(refundShare * 100, 1) }; }
  const beCrm = 100 / contribution;
  const beGoogle = beCrm / (1 - refundShare);
  return {
    contribution_pct: round(contribution, 1),
    break_even_roas_crm: round(beCrm), break_even_roas_google: round(beGoogle),
    max_cpa: round((t * contribution) / 100),
    refund_share_pct: round(refundShare * 100, 1),
    profit_per_ad_real_at_min: round((contribution / 100) * minRoas * (1 - refundShare) - 1),
    warnings,
  };
}

export interface ReconRow { month: string; google_cost: number; google_conversions: number; google_value: number; crm_orders: number; crm_revenue: number }
export interface ReconSummary {
  rows: Array<ReconRow & { value_ratio: number | null; conv_ratio: number | null; roas_google: number | null; roas_crm: number | null; flag: "ok" | "over" | "no_ads" }>;
  over_months: number;
  warning: string | null;
}

/**
 * Compara o que o Google diz que vendeu com o que o CRM realmente recebeu. Valor do Google muito acima da receita
 * paga indica pedido cancelado/devolvido contado como venda (ou superatribuicao) e infla o ROAS.
 */
export function reconcile(rows: ReconRow[]): ReconSummary {
  const out = rows.map((r) => {
    const ratio = r.crm_revenue > 0 ? r.google_value / r.crm_revenue : null;
    const convRatio = r.crm_orders > 0 ? r.google_conversions / r.crm_orders : null;
    const flag = r.google_cost <= 0 ? "no_ads" as const : (ratio !== null && ratio > 1.1) || (convRatio !== null && convRatio > 1.2) ? "over" as const : "ok" as const;
    return {
      ...r, value_ratio: ratio === null ? null : round(ratio), conv_ratio: convRatio === null ? null : round(convRatio),
      roas_google: r.google_cost > 0 ? round(r.google_value / r.google_cost) : null, roas_crm: r.google_cost > 0 ? round(r.crm_revenue / r.google_cost) : null, flag,
    };
  });
  const over = out.filter((r) => r.flag === "over").length;
  return {
    rows: out, over_months: over,
    warning: over ? `Em ${over} mes(es) o Google contou mais venda do que o CRM recebeu: o ROAS do Google pode estar inflado.` : null,
  };
}
