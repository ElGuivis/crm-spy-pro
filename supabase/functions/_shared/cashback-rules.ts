// Regras do cashback (puras, sem banco): base de cálculo, crédito, pedido mínimo e o cupom que vai para a loja.
// Tudo que a tela de configuração controla passa por aqui; li-cashback, o consumidor do pedido e o liberador usam o mesmo cálculo.
import type { CouponSpec } from "./li-coupons.ts";

export interface CashbackRuleConfig {
  discount_percentage: number;
  max_discount_value?: number | null;
  min_purchase_value?: number | null;
  max_cart_percent?: number | null;
  min_order_mode?: string | null;
  min_order_value?: number | null;
  min_credit_value?: number | null;
  base_excludes_shipping?: boolean | null;
  personal_coupon?: boolean | null;
  cumulative?: boolean | null;
}

export interface OrderTotals { total?: number | string | null; subtotal?: number | string | null; discount?: number | string | null; shipping?: number | string | null }

const n = (v: unknown): number => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(x) ? x : 0; };
export const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
export const brl = (v: number): string => `R$ ${money(v).toFixed(2).replace(".", ",")}`;

/** Valor sobre o qual o cashback é calculado: produtos menos desconto (o que o cliente pagou de fato), sem frete; ou o total com frete. */
export function cashbackBase(t: OrderTotals | null | undefined, excludeShipping: boolean | null | undefined = true): number {
  const total = n(t?.total);
  if (excludeShipping === false) return money(Math.max(total, 0));
  const hasParts = t?.subtotal != null && t?.subtotal !== "";
  const products = hasParts ? n(t?.subtotal) - n(t?.discount) : total - n(t?.shipping);
  return money(Math.max(products, 0));
}

/** Crédito do pedido: % da base, limitado pelo teto de crédito. 0 quando fica abaixo do crédito mínimo. */
export function creditFor(base: number, cfg: CashbackRuleConfig): number {
  let credit = (base * n(cfg.discount_percentage)) / 100;
  const cap = n(cfg.max_discount_value);
  if (cap > 0 && credit > cap) credit = cap;
  credit = money(credit);
  return credit > 0 && credit >= n(cfg.min_credit_value) ? credit : 0;
}

/** Pedido mínimo da compra futura para usar o cupom (null = sem mínimo). */
export function minOrderFor(credit: number, cfg: CashbackRuleConfig): number | null {
  const v = n(cfg.min_order_value);
  if (cfg.min_order_mode === "fixed" && v > 0) return money(v);
  if (cfg.min_order_mode === "multiple" && v > 0) return money(credit * v);
  return null;
}

/** Cupom enviado à loja. Com `max_cart_percent`: percentual do carrinho com teto no valor do crédito; sem ele: valor fixo (modo antigo). */
export function buildCashbackSpec(cfg: CashbackRuleConfig, credit: number, opts: { validade: string; descricao: string; liCustomerId?: string | number | null }): Omit<CouponSpec, "codigo"> {
  const pct = n(cfg.max_cart_percent);
  const minimo = minOrderFor(credit, cfg);
  const personal = cfg.personal_coupon !== false && Number.isFinite(Number(opts.liCustomerId)) && String(opts.liCustomerId ?? "") !== "";
  return {
    tipo: pct > 0 ? "porcentagem" : "fixo",
    valor: pct > 0 ? pct : credit,
    limiteDesconto: pct > 0 ? credit : undefined,
    valorMinimo: minimo,
    validade: opts.validade,
    quantidade: 1,
    quantidadePorCliente: 1,
    cumulativo: cfg.cumulative !== false,
    descricao: opts.descricao,
    clientes: personal ? [Number(opts.liCustomerId)] : undefined,
  };
}

/** Variáveis extras para os textos: {{percentual_max}} e {{pedido_minimo}}. */
export function extraTemplateVars(cfg: CashbackRuleConfig, credit: number): { percentual_max: string; pedido_minimo: string } {
  const pct = n(cfg.max_cart_percent);
  const minimo = minOrderFor(credit, cfg);
  return { percentual_max: pct > 0 ? `${pct}%` : "100%", pedido_minimo: minimo ? brl(minimo) : "sem mínimo" };
}

/** Pedido cancelado, devolvido ou em chargeback: não gera nem mantém cashback. */
export function isReversedStatus(statusName: string | null | undefined): boolean {
  return /cancel|devolvid|chargeback|estorn|reembols/i.test(statusName ?? "");
}
