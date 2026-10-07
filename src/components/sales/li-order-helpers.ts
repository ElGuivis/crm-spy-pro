import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import type { LiShippingAddress } from "@/lib/store-json";

export interface OrderItemView {
  id: string;
  name: string | null;
  sku: string | null;
  qty: number;
  price: number;
  raw_json: Json;
}

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
  endereco: LiShippingAddress | null;
  peso_real: number | null;
  cupom_desconto: string | null;
  observacoes: string | null;
  envios: unknown;
  parcelas: unknown;
  items: OrderItemView[];
}

export const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numValue);
};

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch { return String(dateString); }
};

export const formatCPFCNPJ = (value: string | null | undefined) => {
  if (!value) return "-";
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 11) return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (cleaned.length === 14) return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
};

export const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const getStatusColor = (status: string | null) => {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes('pago') || s.includes('aprovado') || s.includes('concluido') || s.includes('entregue')) return "default";
  if (s.includes('pendente') || s.includes('aguardando')) return "secondary";
  if (s.includes('cancelado') || s.includes('estornado')) return "destructive";
  if (s.includes('enviado') || s.includes('transporte')) return "outline";
  return "secondary";
};

export const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
};

export const getItemRaw = <T = string>(item: OrderItemView, key: string): T | null => {
  if (!item.raw_json || typeof item.raw_json !== 'object' || Array.isArray(item.raw_json)) return null;
  return ((item.raw_json as Record<string, unknown>)[key] ?? null) as T | null;
};
