import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { jsonAs } from "@/lib/json-access";
import type { LiOrderRaw, LiOrderTotals, LiOrderPayment, LiOrderShipping } from "@/lib/store-json";
import { DBOrder, DBOrderItem, OrderView, OrderItemView } from "./sales-types";

export function getMostRecentSync(integration: {
  last_sync_at?: string | null; last_sync_orders_at?: string | null; last_orders_sync_at?: string | null;
}): string | null {
  const dates = [
    integration.last_sync_at,
    integration.last_sync_orders_at,
    integration.last_orders_sync_at,
  ].filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) =>
    new Date(current) > new Date(latest) ? current : latest
  );
}

export function mapOrder(db: DBOrder, items?: DBOrderItem[]): OrderView {
  const totals = jsonAs<LiOrderTotals>(db.totals_json);
  const payment = jsonAs<LiOrderPayment>(db.payment_json);
  const shipping = jsonAs<LiOrderShipping>(db.shipping_json);
  const raw = jsonAs<LiOrderRaw>(db.raw_json);
  const cliente = raw?.cliente && typeof raw.cliente === 'object' ? raw.cliente : null;

  return {
    id: db.id,
    order_number: db.order_number,
    status_name: db.status_name,
    status_id: db.status_id,
    customer_name: raw?.cliente_nome || cliente?.nome || null,
    customer_email: raw?.cliente_email || cliente?.email || null,
    customer_phone: raw?.cliente_telefone || cliente?.telefone_celular || cliente?.telefone_principal || null,
    customer_doc: raw?.cliente_cpf_cnpj || cliente?.cpf || cliente?.cnpj || null,
    valor_subtotal: totals?.subtotal ?? null,
    valor_desconto: totals?.discount ?? null,
    valor_frete: totals?.shipping ?? null,
    valor_total: totals?.total ?? null,
    created_at_remote: db.created_at_remote,
    updated_at_remote: db.updated_at_remote,
    forma_pagamento: payment?.method ?? null,
    pagamento_tipo: payment?.type ?? null,
    pagamento_parcelas: payment?.installments ?? null,
    pagamento_bandeira: payment?.brand ?? null,
    pagamento_codigo: null,
    gateway_pagamento: payment?.gateway ?? null,
    transacao_id: payment?.transaction_id ?? null,
    data_pagamento: payment?.data_pagamento ?? null,
    forma_envio: shipping?.method ?? null,
    codigo_rastreio: shipping?.tracking_code ?? null,
    url_rastreio: shipping?.tracking_url ?? null,
    data_envio: shipping?.data_envio ?? null,
    nome_destinatario: shipping?.nome_destinatario ?? null,
    telefone_destinatario: shipping?.telefone_destinatario ?? null,
    endereco: shipping?.address ?? null,
    peso_real: shipping?.peso_real ?? null,
    cupom_desconto: raw?.cupom_desconto ?? null,
    observacoes: raw?.observacoes ?? null,
    envios: shipping?.all_envios ?? null,
    parcelas: payment?.all_payments ?? null,
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
