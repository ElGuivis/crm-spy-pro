import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export async function lookupOrderRaw(
  supabase: ServiceClient,
  tenantId: string,
  orderNum: string,
  agent: Record<string, unknown>,
  log: Log,
): Promise<{ raw: Record<string, unknown>; source: string; formatted: string } | null> {
  const cleanNum = orderNum.replace(/\D/g, '');
  if (!cleanNum) return null;

  log.info(`🔍 Looking up order: ${cleanNum} for tenant: ${tenantId}`);

  const storeIntegrationId = agent?.store_integration_id;

  // 1. Try Loja Integrada orders
  {
    let query = supabase
      .from('li_orders')
      .select('order_number, status_name, created_at_remote, totals_json, items_json, shipping_json, raw_json')
      .eq('tenant_id', tenantId);
    if (storeIntegrationId) query = query.eq('integration_id', storeIntegrationId);
    const { data: liOrders } = await query.eq('order_number', cleanNum).limit(1);
    if (liOrders && liOrders.length > 0) {
      const order = liOrders[0];
      return { raw: order, source: 'li', formatted: formatLIOrderResponse(order, agent) };
    }
  }

  // 2. Try Bling orders
  {
    let query = supabase
      .from('bling_orders')
      .select('numero, situacao_nome, data_criacao, valor_total, cliente_nome, cliente_cpf_cnpj, forma_pagamento, forma_envio, volumes, etiqueta, itens:bling_order_items(produto_nome, quantidade, valor_unitario)')
      .eq('tenant_id', tenantId);
    if (storeIntegrationId) query = query.eq('integration_id', storeIntegrationId);
    const { data: blingOrders } = await query.eq('numero', cleanNum).limit(1);
    if (blingOrders && blingOrders.length > 0) {
      const order = blingOrders[0];
      return { raw: order, source: 'bling', formatted: formatBlingOrderResponse(order, agent) };
    }
  }

  // 3. Try Melhor Envio shipments
  {
    const { data: shipments } = await supabase
      .from('me_shipments')
      .select('id, me_id, external_order_number, status, tracking_code, carrier, created_at')
      .eq('tenant_id', tenantId)
      .eq('external_order_number', cleanNum)
      .order('created_at', { ascending: false })
      .limit(1);
    if (shipments && shipments.length > 0) {
      const s = shipments[0];
      const statusMap: Record<string, string> = {
        'posted': '📬 Postado', 'in_transit': '🚚 Em trânsito',
        'delivered': '✅ Entregue', 'canceled': '❌ Cancelado', 'pending': '⏳ Pendente',
      };
      const statusLabel = statusMap[s.status] || s.status;
      const trackingInfo = s.tracking_code ? `\n📮 *Rastreio:* ${s.tracking_code}` : '';
      const formatted = `📦 *Rastreamento do Pedido #${s.external_order_number}*\n\n🚚 *Transportadora:* ${s.carrier || 'Não informada'}\n📊 *Status:* ${statusLabel}${trackingInfo}\n\nDigite "menu" para voltar ao menu principal.`;
      return { raw: s, source: 'me', formatted };
    }
  }

  return null;
}

export function formatLIOrderResponse(order: Record<string, unknown>, agent: Record<string, unknown>): string {
  const orderNum = order.order_number;
  const status = order.status_name || 'Não informado';
  const date = order.created_at_remote ? new Date(order.created_at_remote as string).toLocaleDateString('pt-BR') : '';
  const totals = (order.totals_json || {}) as Record<string, unknown>;
  const total = totals.total ? Number(totals.total).toFixed(2) : '0.00';
  const shipping = (order.shipping_json || {}) as Record<string, unknown>;
  const tracking = (shipping.tracking_code as string) || '';
  const rawJson = order.raw_json as Record<string, unknown> | null;
  const cliente = (rawJson?.cliente || {}) as Record<string, unknown>;
  const shippingAddress = (shipping.address || {}) as Record<string, unknown>;
  const clientName = (cliente.nome as string) || (shippingAddress.nome as string) || '';

  const orderItems = order.items_json;
  let itemsText = '';
  if (orderItems && Array.isArray(orderItems) && orderItems.length > 0) {
    itemsText = (orderItems as Record<string, unknown>[]).slice(0, 5).map((item) => {
      const name = item.name || item.produto_nome || 'Produto';
      const qty = item.qty || item.quantidade || 1;
      return `• ${name} (x${qty})`;
    }).join('\n');
    if ((orderItems as unknown[]).length > 5) itemsText += `\n... e mais ${(orderItems as unknown[]).length - 5} itens`;
  }

  if (agent?.order_details_template) {
    let template = agent.order_details_template as string;
    template = template
      .replace(/\{numero\}/g, String(orderNum)).replace(/\{situacao_nome\}/g, String(status))
      .replace(/\{data_criacao\}/g, date).replace(/\{cliente_nome\}/g, clientName)
      .replace(/\{valor_total\}/g, total).replace(/\{codigo_rastreio\}/g, tracking || 'Não disponível')
      .replace(/\{order_items\}/g, itemsText || 'Nenhum item').replace(/\{forma_pagamento\}/g, 'Não informado')
      .replace(/\{order_number\}/g, String(orderNum)).replace(/\{status\}/g, String(status))
      .replace(/\{customer_name\}/g, clientName).replace(/\{date\}/g, date)
      .replace(/\{total\}/g, total).replace(/\{tracking_code\}/g, tracking || 'Não disponível')
      .replace(/\{payment_method\}/g, 'Não informado');
    return template + '\n\nDigite "menu" para voltar ao menu principal.';
  }

  const items = itemsText ? '\n\n📋 *Itens:*\n' + itemsText : '';
  const trackingLine = tracking ? `\n📮 *Rastreio:* ${tracking}` : '';
  return `📦 *Pedido #${orderNum}*\n\n👤 *Cliente:* ${clientName}\n📅 *Data:* ${date}\n💰 *Total:* R$ ${total}\n📊 *Status:* ${status}${trackingLine}${items}\n\nDigite "menu" para voltar ao menu principal.`;
}

export function formatBlingOrderResponse(order: Record<string, unknown>, agent: Record<string, unknown>): string {
  const orderNum = order.numero;
  const status = order.situacao_nome || 'Não informado';
  const clientName = (order.cliente_nome as string) || '';
  const date = order.data_criacao ? new Date(order.data_criacao as string).toLocaleDateString('pt-BR') : '';
  const total = order.valor_total ? Number(order.valor_total).toFixed(2) : '0.00';

  let tracking = '';
  const etiqueta = order.etiqueta as Record<string, unknown> | null;
  if (etiqueta?.codigo) tracking = etiqueta.codigo as string;
  if (!tracking && order.volumes && Array.isArray(order.volumes)) {
    for (const vol of order.volumes as Record<string, unknown>[]) {
      if (vol.codigoRastreamento) { tracking = vol.codigoRastreamento as string; break; }
    }
  }

  let itemsText = '';
  if (order.itens && Array.isArray(order.itens) && (order.itens as unknown[]).length > 0) {
    itemsText = (order.itens as Record<string, unknown>[]).slice(0, 5).map((item) => {
      const name = item.produto_nome || 'Produto';
      const qty = item.quantidade || 1;
      return `• ${name} (x${qty})`;
    }).join('\n');
    if ((order.itens as unknown[]).length > 5) itemsText += `\n... e mais ${(order.itens as unknown[]).length - 5} itens`;
  }

  if (agent?.order_details_template) {
    let template = agent.order_details_template as string;
    template = template
      .replace(/\{numero\}/g, String(orderNum)).replace(/\{situacao_nome\}/g, String(status))
      .replace(/\{data_criacao\}/g, date).replace(/\{cliente_nome\}/g, clientName)
      .replace(/\{valor_total\}/g, total).replace(/\{codigo_rastreio\}/g, tracking || 'Não disponível')
      .replace(/\{order_items\}/g, itemsText || 'Nenhum item')
      .replace(/\{forma_pagamento\}/g, (order.forma_pagamento as string) || 'Não informado')
      .replace(/\{order_number\}/g, String(orderNum)).replace(/\{status\}/g, String(status))
      .replace(/\{customer_name\}/g, clientName).replace(/\{date\}/g, date)
      .replace(/\{total\}/g, total).replace(/\{tracking_code\}/g, tracking || 'Não disponível')
      .replace(/\{payment_method\}/g, (order.forma_pagamento as string) || 'Não informado');
    return template + '\n\nDigite "menu" para voltar ao menu principal.';
  }

  const items = itemsText ? '\n\n📋 *Itens:*\n' + itemsText : '';
  const trackingLine = tracking ? `\n📮 *Rastreio:* ${tracking}` : '';
  return `📦 *Pedido #${orderNum}*\n\n👤 *Cliente:* ${clientName}\n📅 *Data:* ${date}\n💰 *Total:* R$ ${total}\n📊 *Status:* ${status}${trackingLine}${items}\n\nDigite "menu" para voltar ao menu principal.`;
}
