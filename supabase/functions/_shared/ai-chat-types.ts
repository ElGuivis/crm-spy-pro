/** Verification data stored on conversation.verification_data */
export interface VerificationData {
  order_id?: string;
  order_number?: string;
  cpf_prefix?: string;
  phone_suffix?: string;
  verification_type?: 'cpf' | 'phone';
  order_data?: Record<string, unknown>;
  attempts?: number;
  shipment_id?: string;
  shipment_data?: Record<string, unknown>;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  quantidade?: number | null;
  produto_nome?: string | null;
  preco_subtotal?: number | null;
  valor_total?: number | null;
  [key: string]: unknown;
}

export interface OrderRow {
  id: string;
  numero?: string;
  data_criacao?: string | null;
  situacao_nome?: string | null;
  valor_total?: number | null;
  valor_frete?: number | null;
  forma_pagamento?: string | null;
  forma_envio?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_cpf_cnpj?: string | null;
  endereco_entrega?: Record<string, unknown> | null;
  endereco_entrega_cidade?: string | null;
  endereco_entrega_estado?: string | null;
  codigo_rastreio?: string | null;
  [key: string]: unknown;
}

export interface ProductRow {
  id: string;
  nome: string;
  preco?: number | null;
  preco_cheio?: number | null;
  preco_promocional?: number | null;
  estoque_atual?: number | null;
  estoque_quantidade?: number | null;
  categoria_nome?: string | null;
  [key: string]: unknown;
}

export interface CustomerRow {
  id: string;
  nome?: string;
  cpf_cnpj?: string | null;
  cpf?: string | null;
  celular?: string | null;
  telefone?: string | null;
  telefone_celular?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

export interface TrackingEvent {
  date?: string;
  description?: string;
  message?: string;
}

export interface ShipmentRow {
  id: string;
  external_order_number?: string | null;
  carrier?: string | null;
  service_name?: string | null;
  status?: string | null;
  tracking_code?: string | null;
  estimated_delivery_at?: string | null;
  tracking_history?: TrackingEvent[] | null;
  tracking_data?: TrackingEvent[] | null;
  receiver_city?: string | null;
  receiver_state?: string | null;
  receiver_name?: string | null;
  posted_at?: string | null;
  delivered_at?: string | null;
  receiver_document?: string | null;
  receiver_phone?: string | null;
  [key: string]: unknown;
}

export interface ChatRequest {
  conversation_id: string;
  message_id?: string;
  tenant_id: string;
  contact_phone: string;
  integration_id: string;
  button_click_id?: string;
  combined_message_content?: string;
  initialization_only?: boolean;
}

export interface AgentTransferRule {
  target_agent_id: string;
  keywords: string[];
  description?: string;
}

export interface KeywordActionRule {
  keywords: string[];
  action_type: 'send_response' | 'move_column' | 'send_and_move';
  response_message?: string;
  target_column_id?: string;
  description?: string;
}
