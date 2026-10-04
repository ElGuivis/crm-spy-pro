export interface GeneratedCoupon {
  id: string;
  coupon_code: string;
  discount_percentage: number;
  coupon_value: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_id: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  used_in_order_id: string | null;
  used_order_value: number | null;
  config_id: string | null;
  integration_id: string | null;
  source?: string;
  li_coupon_id?: number | null;
  coupon_type?: string | null;
  coupon_description?: string | null;
  li_quantidade_usada?: number | null;
  li_quantidade_uso_maximo?: number | null;
  li_quantidade_por_cliente?: number | null;
  li_valor_minimo?: number | null;
  li_ativo?: boolean | null;
}

export type StatusCode = "used" | "expired" | "limit_reached" | "inactive" | "active";
export interface CouponStatus { code: StatusCode; label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: string }

/** Cupom de uso único (cashback e os criados por e-mail): "utilizado" quando foi usado. Os de uso múltiplo seguem ativos enquanto não vencem. */
const isSingleUse = (c: GeneratedCoupon) => c.li_quantidade_uso_maximo === 1 || c.source === "cashback";

export function getCouponStatus(c: GeneratedCoupon, now = new Date()): CouponStatus {
  if (c.used_at && isSingleUse(c)) return { code: "used", label: "Utilizado", variant: "default", icon: "check" };
  if (c.li_ativo === false) return { code: "inactive", label: "Inativo", variant: "outline", icon: "x" };
  if (c.expires_at && new Date(c.expires_at) < now) return { code: "expired", label: "Expirado", variant: "destructive", icon: "x" };
  if (c.li_quantidade_uso_maximo != null && (c.li_quantidade_usada ?? 0) >= c.li_quantidade_uso_maximo) return { code: "limit_reached", label: "Limite atingido", variant: "destructive", icon: "x" };
  return { code: "active", label: "Ativo", variant: "secondary", icon: "clock" };
}

export function getCouponSource(source?: string): { label: string; className: string } {
  switch (source) {
    case "imported": return { label: "Campanha", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
    case "manual": return { label: "Criado aqui", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
    case "email": return { label: "E-mail marketing", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" };
    default: return { label: "Cashback", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
  }
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** "10%", "R$ 20,00" ou "Frete grátis". */
export function discountLabel(c: GeneratedCoupon): string {
  if (c.coupon_type === "frete_gratis") return "Frete grátis";
  if (c.coupon_type === "fixo" || c.coupon_type === "valor_absoluto") return c.coupon_value ? brl(c.coupon_value) : "—";
  return `${Number(c.discount_percentage)}%`;
}

/** Filtro de origem: "campaign" = tudo que não é cashback automático (a visão padrão). */
export function matchesSource(c: GeneratedCoupon, filter: string): boolean {
  const source = c.source || "cashback";
  if (filter === "all") return true;
  if (filter === "campaign") return source !== "cashback";
  return source === filter;
}

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Sem validade");
export const formatPhone = (phone: string | null) => { if (!phone) return "-"; const c = phone.replace(/\D/g, ""); return c.length === 13 ? `(${c.slice(2, 4)}) ${c.slice(4, 9)}-${c.slice(9)}` : phone; };
export const formatCurrency = brl;
