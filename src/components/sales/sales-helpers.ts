import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Json } from "@/integrations/supabase/types";
import { DBOrder, DBOrderItem, OrderView, OrderItemView } from "./sales-types";

export function getJson(json: Json | null, key: string): any {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return (json as any)[key] ?? null;
}

export function getMostRecentSync(integration: any): string | null {
  const dates = [
    integration.last_sync_at,
    integration.last_sync_orders_at,
    integration.last_orders_sync_at,
  ].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.reduce((latest: string, current: string) =>
    new Date(current) > new Date(latest) ? current : latest
  );
}

export function mapOrder(db: DBOrder, items?: DBOrderItem[]): OrderView {
  const totals = db.totals_json;
  const payment = db.payment_json;
  const shipping = db.shipping_json;
  const raw = db.raw_json;

  return {
    id: db.id,
    order_number: db.order_number,
    status_name: db.status_name,
    status_id: db.status_id,
    customer_name: getJson(raw, 'cliente_nome') || (typeof getJson(raw, 'cliente') === 'object' ? getJson(raw, 'cliente')?.nome : null),
    customer_email: getJson(raw, 'cliente_email') || (typeof getJson(raw, 'cliente') === 'object' ? getJson(raw, 'cliente')?.email : null),
    customer_phone: getJson(raw, 'cliente_telefone') || (typeof getJson(raw, 'cliente') === 'object' ? (getJson(raw, 'cliente')?.telefone_celular || getJson(raw, 'cliente')?.telefone_principal) : null),
    customer_doc: getJson(raw, 'cliente_cpf_cnpj') || (typeof getJson(raw, 'cliente') === 'object' ? (getJson(raw, 'cliente')?.cpf || getJson(raw, 'cliente')?.cnpj) : null),
    valor_subtotal: getJson(totals, 'subtotal'),
    valor_desconto: getJson(totals, 'discount'),
    valor_frete: getJson(totals, 'shipping'),
    valor_total: getJson(totals, 'total'),
    created_at_remote: db.created_at_remote,
    updated_at_remote: db.updated_at_remote,
    forma_pagamento: getJson(payment, 'method'),
    pagamento_tipo: getJson(payment, 'type'),
    pagamento_parcelas: getJson(payment, 'installments'),
    pagamento_bandeira: getJson(payment, 'brand'),
    pagamento_codigo: null,
    gateway_pagamento: getJson(payment, 'gateway'),
    transacao_id: getJson(payment, 'transaction_id'),
    data_pagamento: getJson(payment, 'data_pagamento'),
    forma_envio: getJson(shipping, 'method'),
    codigo_rastreio: getJson(shipping, 'tracking_code'),
    url_rastreio: getJson(shipping, 'tracking_url'),
    data_envio: getJson(shipping, 'data_envio'),
    nome_destinatario: getJson(shipping, 'nome_destinatario'),
    telefone_destinatario: getJson(shipping, 'telefone_destinatario'),
    endereco: getJson(shipping, 'address'),
    peso_real: getJson(shipping, 'peso_real'),
    cupom_desconto: getJson(raw, 'cupom_desconto'),
    observacoes: getJson(raw, 'observacoes'),
    envios: getJson(shipping, 'all_envios'),
    parcelas: getJson(payment, 'all_payments'),
    items: (items || []).map((i): OrderItemView => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      qty: i.qty,
      price: i.price,
      raw_json: i.raw_json,
    })),
    raw: db,
  };
}

export function formatCurrency(value: number | null): string {
  if (value === null) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try { return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return dateStr; }
}

export function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return "Nunca";
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR }); }
  catch { return "Nunca"; }
}

export function getStatusColor(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes("pago") || s.includes("completo") || s.includes("enviado")) return "default";
  if (s.includes("aguard") || s.includes("pendent")) return "secondary";
  if (s.includes("cancel")) return "destructive";
  return "outline";
}
