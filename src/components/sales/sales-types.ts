import { Tables, Json } from "@/integrations/supabase/types";

export type DBOrder = Tables<'li_orders'>;
export type DBOrderItem = Tables<'li_order_items'>;

export const LI_ORDER_SELECT = 'id, order_number, status_name, status_id, totals_json, payment_json, shipping_json, raw_json, items_json, created_at_remote, updated_at_remote';

export interface OrderView {
  id: string;
  order_number: string;
  status_name: string | null;
  status_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_doc: string | null;
  valor_subtotal: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  valor_total: number | null;
  created_at_remote: string | null;
  updated_at_remote: string | null;
  forma_pagamento: string | null;
  pagamento_tipo: string | null;
  pagamento_parcelas: number | null;
  pagamento_bandeira: string | null;
  pagamento_codigo: string | null;
  gateway_pagamento: string | null;
  transacao_id: string | null;
  data_pagamento: string | null;
  forma_envio: string | null;
  codigo_rastreio: string | null;
  url_rastreio: string | null;
  data_envio: string | null;
  nome_destinatario: string | null;
  telefone_destinatario: string | null;
  endereco: any;
  peso_real: number | null;
  cupom_desconto: string | null;
  observacoes: string | null;
  envios: any;
  parcelas: any;
  items: OrderItemView[];
  raw: DBOrder;
}

export interface OrderItemView {
  id: string;
  name: string | null;
  sku: string | null;
  qty: number;
  price: number;
  raw_json: Json;
}

export interface SyncStats {
  orders: number;
  lastOrdersSync: string | null;
}

export interface SalesContentProps {
  integrationId: string;
}
