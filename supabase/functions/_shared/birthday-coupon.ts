// Cupom de aniversário (puro, sem banco): monta o cupom enviado à loja e os textos a partir das opções da tela.
import type { CouponSpec } from "./li-coupons.ts";

export interface BirthdayCouponConfig {
  coupon_type?: string | null;
  coupon_discount_percent: number;
  coupon_fixed_value?: number | null;
  max_discount_value?: number | null;
  min_order_value?: number | null;
  cumulative?: boolean | null;
  personal_coupon?: boolean | null;
}

const n = (v: unknown): number => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(x) ? x : 0; };
const brl = (v: number): string => `R$ ${v.toFixed(2).replace(".", ",")}`;
const kind = (c: BirthdayCouponConfig): "porcentagem" | "fixo" | "frete_gratis" =>
  c.coupon_type === "fixo" || c.coupon_type === "frete_gratis" ? c.coupon_type : "porcentagem";

export function buildBirthdaySpec(cfg: BirthdayCouponConfig, opts: { validade: string; descricao: string; liCustomerId?: string | number | null }): Omit<CouponSpec, "codigo"> {
  const tipo = kind(cfg);
  const personal = cfg.personal_coupon !== false && String(opts.liCustomerId ?? "") !== "" && Number.isFinite(Number(opts.liCustomerId));
  return {
    tipo,
    valor: tipo === "fixo" ? n(cfg.coupon_fixed_value) : tipo === "frete_gratis" ? 0 : n(cfg.coupon_discount_percent),
    limiteDesconto: tipo === "porcentagem" && n(cfg.max_discount_value) > 0 ? n(cfg.max_discount_value) : undefined,
    valorMinimo: n(cfg.min_order_value) > 0 ? n(cfg.min_order_value) : null,
    validade: opts.validade,
    quantidade: 1,
    quantidadePorCliente: 1,
    cumulativo: cfg.cumulative === true,
    descricao: opts.descricao,
    clientes: personal ? [Number(opts.liCustomerId)] : undefined,
  };
}

/** Variáveis dos textos: {{desconto}} (número do % ou do valor), {{desconto_texto}} ("10%", "R$ 20,00", "frete grátis"), {{pedido_minimo}}, {{teto_desconto}}. */
export function birthdayVars(cfg: BirthdayCouponConfig): Record<string, string> {
  const tipo = kind(cfg);
  const desconto = tipo === "fixo" ? n(cfg.coupon_fixed_value).toFixed(2).replace(".", ",") : tipo === "frete_gratis" ? "0" : String(n(cfg.coupon_discount_percent));
  return {
    desconto,
    desconto_texto: tipo === "fixo" ? brl(n(cfg.coupon_fixed_value)) : tipo === "frete_gratis" ? "frete grátis" : `${n(cfg.coupon_discount_percent)}%`,
    pedido_minimo: n(cfg.min_order_value) > 0 ? brl(n(cfg.min_order_value)) : "sem mínimo",
    teto_desconto: tipo === "porcentagem" && n(cfg.max_discount_value) > 0 ? brl(n(cfg.max_discount_value)) : "sem teto",
  };
}

/** Substitui {{chave}} e o formato antigo {chave}. */
export function fillBirthday(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v).split(`{${k}}`).join(v), text);
}
