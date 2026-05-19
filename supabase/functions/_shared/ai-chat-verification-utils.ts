import type { TrackingEvent, ShipmentRow } from "./ai-chat-types.ts";

export function replaceMessageVariables(message: string, vars: Record<string, string | number>): string {
  let result = message;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

export function translateShippingStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '⏳ Aguardando',
    released: '✅ Liberado',
    posted: '📮 Postado',
    in_transit: '🚚 Em Trânsito',
    out_for_delivery: '📦 Saiu para Entrega',
    delivered: '✅ Entregue',
    canceled: '❌ Cancelado',
    undelivered: '⚠️ Não entregue',
    waiting_payment: '💰 Aguardando Pagamento',
  };
  return statusMap[status] || status;
}

export function formatTrackingEvents(trackingData: TrackingEvent[] | null | undefined): string {
  if (!trackingData) return 'Sem histórico disponível';
  const events = Array.isArray(trackingData) ? trackingData : [];
  if (events.length === 0) return 'Sem histórico disponível';
  return events.slice(0, 5).map((e: TrackingEvent) => {
    const date = e.date ? new Date(e.date).toLocaleDateString('pt-BR') : '';
    const time = e.date ? new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const desc = e.description || e.message || 'Atualização';
    return `• ${date} ${time} - ${desc}`;
  }).join('\n');
}

export function buildShippingDetails(
  shipment: ShipmentRow | null,
  afterVerifiedMsg: string,
  template: string,
  trackingLinkBase: string,
): string {
  const estimatedDelivery = shipment?.estimated_delivery_at
    ? new Date(shipment.estimated_delivery_at).toLocaleDateString('pt-BR')
    : 'Não informada';
  const trackingCode = shipment?.tracking_code || '';
  const linkRastreamento = trackingLinkBase && trackingCode
    ? `${trackingLinkBase}${trackingCode}`
    : trackingCode || 'Aguardando código';

  return replaceMessageVariables(template, {
    order_number: shipment?.external_order_number || '',
    carrier: shipment?.carrier || 'Não informada',
    service: shipment?.service_name ? `- ${shipment.service_name}` : '',
    status: translateShippingStatus(shipment?.status || 'pending'),
    tracking_code: trackingCode || 'Aguardando',
    estimated_delivery: estimatedDelivery,
    destination: `${shipment?.receiver_city || 'Não informado'}/${shipment?.receiver_state || ''}`,
    receiver_name: shipment?.receiver_name || '',
    receiver_city: shipment?.receiver_city || '',
    receiver_state: shipment?.receiver_state || '',
    tracking_events: formatTrackingEvents(shipment?.tracking_history || shipment?.tracking_data),
    posted_at: shipment?.posted_at ? new Date(shipment.posted_at).toLocaleDateString('pt-BR') : 'Não postado',
    delivered_at: shipment?.delivered_at ? new Date(shipment.delivered_at).toLocaleDateString('pt-BR') : '-',
    link_rastreamento: linkRastreamento,
    after_verified: afterVerifiedMsg,
  });
}

/** Extract a numeric order number from a free-text message. */
export function extractOrderNumber(text: string): string | null {
  const patterns = [
    /pedido[:\s#]*(\d{3,})/gi,
    /n[uú]mero[:\s#]*(\d{3,})/gi,
    /#(\d{4,})/g,
    /\b(\d{4,10})\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) return match[1];
    }
  }
  return null;
}

export function defaultShippingVerificationMessages(): Record<string, string> {
  return {
    ask_order_number: 'Por favor, informe o *número do pedido* para rastrear sua entrega.',
    ask_cpf: 'Agora preciso dos *3 primeiros dígitos do CPF* cadastrado na entrega para confirmar sua identidade.',
    ask_phone: 'Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega para confirmar sua identidade.',
    ask_both: 'Para rastrear sua entrega, informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado',
    order_not_found: '❌ Não encontrei envio para o pedido *#{order_number}*.\n\nVerifique o número e tente novamente.',
    cpf_wrong: '❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_',
    phone_wrong: '❌ Telefone incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_',
    max_attempts: '⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.',
    cpf_max_attempts: '⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.',
    order_verified: '✅ *Entrega encontrada!*\n\n{order_details}',
    after_verified: 'Posso ajudar com mais alguma coisa sobre esta entrega?',
  };
}

export function defaultOrderVerificationMessages(): Record<string, string> {
  return {
    ask_order_number: 'Por favor, informe o *número do pedido* para que eu possa consultar.',
    ask_cpf: 'Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.',
    ask_phone: 'Por favor, informe os *4 últimos dígitos do telefone* cadastrado no pedido para confirmar sua identidade.',
    ask_both: 'Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado',
    order_not_found: '❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.',
    cpf_wrong: '❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_',
    phone_wrong: '❌ Telefone incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_',
    max_attempts: '⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.',
    cpf_max_attempts: '⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.',
    order_verified: '✅ *Pedido encontrado!*\n\n{order_details}',
    after_verified: 'Posso ajudar com mais alguma coisa sobre este pedido?',
  };
}

export const DEFAULT_SHIPPING_DETAILS_TEMPLATE = `📦 *Rastreamento do Pedido #{order_number}*

🚚 *Transportadora:* {carrier} {service}
📍 *Status:* {status}
🔢 *Código de Rastreio:* {tracking_code}

📅 *Previsão de Entrega:* {estimated_delivery}
📍 *Destino:* {destination}

📋 *Histórico de Rastreamento:*
{tracking_events}

{after_verified}`;
