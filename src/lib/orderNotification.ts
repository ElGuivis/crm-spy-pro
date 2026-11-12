// Tipos, textos padrão e conversões da notificação de status do pedido (separado do hook para respeitar o limite de tamanho).
export type DelayUnit = "minutes" | "hours" | "days" | "months";

export const DELAY_UNIT_LABELS: Record<DelayUnit, string> = {
  minutes: "Minutos", hours: "Horas", days: "Dias", months: "Meses",
};

export interface StatusRule {
  id?: string;
  status_name: string;
  status_id?: number;
  is_enabled: boolean;
  message_template: string;
  email_subject?: string;
  email_body?: string;
  delay_minutes: number;
  delay_value?: number;
  delay_unit?: DelayUnit;
  /** Lembrete: segundo aviso se o pedido continuar no mesmo status depois de X (contado a partir do aviso principal). */
  followup_enabled?: boolean;
  followup_delay_minutes?: number;
  followup_delay_value?: number;
  followup_delay_unit?: DelayUnit;
  followup_template?: string;
}

export interface OrderNotificationConfig {
  id?: string;
  name: string;
  integration_id: string | null;
  whatsapp_integration_id: string | null;
  email_integration_id: string | null;
  send_via_whatsapp: boolean;
  send_via_email: boolean;
  is_active: boolean;
  /** Janela de envio em horário de Brasília: fora dela a mensagem espera a abertura. */
  send_window_enabled: boolean;
  send_window_start: number;
  send_window_end: number;
  status_rules: StatusRule[];
}

export interface Integration { id: string; name: string; type: string; status: string; }
export interface EmailIntegration { id: string; name: string; sender_email: string; is_active: boolean; }

export const MESSAGE_PLACEHOLDERS = [
  { key: "{{cliente_nome}}", label: "Nome Completo" },
  { key: "{{cliente_primeiro_nome}}", label: "Primeiro Nome" },
  { key: "{{numero_pedido}}", label: "Número do Pedido" },
  { key: "{{status}}", label: "Status" },
  { key: "{{valor_total}}", label: "Valor Total" },
  { key: "{{produtos}}", label: "Produtos" },
  { key: "{{rastreamento}}", label: "Código Rastreamento" },
  { key: "{{link_rastreio}}", label: "Link de Rastreio" },
];

export const DEFAULT_MESSAGES: Record<string, string> = {
  "Pedido Pago": "Olá {{cliente_primeiro_nome}}! 🎉 Seu pedido #{{numero_pedido}} foi confirmado! Valor: {{valor_total}}. Já estamos preparando para envio.",
  "Pedido Enviado": "Oi {{cliente_primeiro_nome}}! 📦 Seu pedido #{{numero_pedido}} saiu para entrega! {{rastreamento}}",
  "Pedido Entregue": "{{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi entregue! 🏠 Esperamos que goste. Qualquer dúvida, estamos aqui!",
  "Pedido Cancelado": "Olá {{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi cancelado. Se tiver dúvidas, entre em contato.",
};

export const STORE_TYPES = ["loja_integrada", "nuvemshop", "shopify", "woocommerce", "bling"];
export const WHATSAPP_TYPES = ["evolution_whatsapp", "whatsapp_api", "z_api"];

export const getStoreIntegrationIcon = (type: string): string => {
  const map: Record<string, string> = { loja_integrada: "🛒", nuvemshop: "☁️", shopify: "🛍️", woocommerce: "🔮", bling: "📊" };
  return map[type] || "🏪";
};

export const getWhatsAppIntegrationIcon = (type: string): string => {
  const map: Record<string, string> = { evolution_whatsapp: "📱", whatsapp_api: "💬", z_api: "🔌" };
  return map[type] || "📲";
};

export function minutesToDelayConfig(totalMinutes: number): { value: number; unit: DelayUnit } {
  if (totalMinutes <= 0) return { value: 0, unit: "minutes" };
  if (totalMinutes % (30 * 24 * 60) === 0) return { value: totalMinutes / (30 * 24 * 60), unit: "months" };
  if (totalMinutes % (24 * 60) === 0) return { value: totalMinutes / (24 * 60), unit: "days" };
  if (totalMinutes % 60 === 0) return { value: totalMinutes / 60, unit: "hours" };
  return { value: totalMinutes, unit: "minutes" };
}

export function delayConfigToMinutes(value: number, unit: DelayUnit): number {
  switch (unit) {
    case "months": return value * 30 * 24 * 60;
    case "days": return value * 24 * 60;
    case "hours": return value * 60;
    default: return value;
  }
}

export const defaultConfig: OrderNotificationConfig = {
  name: "", integration_id: null, whatsapp_integration_id: null, email_integration_id: null,
  send_via_whatsapp: true, send_via_email: false, is_active: true,
  send_window_enabled: true, send_window_start: 8, send_window_end: 21, status_rules: [],
};


/** Texto sugerido para o lembrete de "Aguardando Pagamento" (PIX sem pagar). */
export const DEFAULT_FOLLOWUP = "Oi {{cliente_primeiro_nome}}, o pagamento do pedido #{{numero_pedido}} ainda não foi confirmado. Se precisar de ajuda para pagar, é só responder aqui.";
