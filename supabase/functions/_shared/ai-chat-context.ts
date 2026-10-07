/**
 * ai-chat-context.ts
 * Builds enriched context (customer, orders, products, carts, coupons, cashback)
 * for AI system prompts. Extracted from ai-chat/index.ts to reduce file size.
 */

import { getStoreIntegration, getTrackingCode, type StoreIntegrationInfo } from "./ai-chat-store.ts";
import { extractFromMessages } from "./ai-chat-smart-search.ts";
import { createLogger } from "./correlation.ts";
import { getStoreColumns } from "./select-columns.ts";
import { buildCashbackInfo, buildCouponsInfo } from "./ai-chat-context-extras.ts";
import { customerOwnsPhone, formatCustomerMinimal } from "./ai-chat-privacy.ts";
import { buildAvailableProductsInfo, lastContactQuestion } from "./ai-chat-catalog.ts";

const log = createLogger("ai-chat-context", "shared");

/** Data access flags from agent config */
export interface DataAccess {
  customer_details: boolean;
  orders: boolean;
  order_items: boolean;
  order_tracking: boolean;
  products: boolean;
  products_featured: boolean;
  products_catalog: boolean;
  coupons: boolean;
  cashback: boolean;
  smart_search: boolean;
}

/** Generic order row shape */
interface OrderRow {
  id: string;
  numero: string;
  situacao_nome: string | null;
  valor_total: number | null;
  valor_frete: number | null;
  data_criacao: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  forma_pagamento: string | null;
  forma_envio: string | null;
  endereco_entrega: Record<string, unknown> | null;
  endereco_entrega_logradouro?: string;
  endereco_entrega_numero?: string;
  endereco_entrega_cidade?: string;
  endereco_entrega_estado?: string;
  codigo_rastreio?: string;
  [key: string]: unknown;
}

/** Generic order item */
interface OrderItemRow {
  id: string;
  order_id: string;
  produto_nome: string | null;
  quantidade: number | null;
  preco_subtotal?: number | null;
  valor_total?: number | null;
  [key: string]: unknown;
}

/** Generic customer row */
interface CustomerRow {
  id: string;
  nome: string;
  email?: string | null;
  celular?: string | null;
  telefone?: string | null;
  telefone_celular?: string | null;
  telefone_principal?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  cpf_cnpj?: string | null;
  endereco?: Record<string, unknown> | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  endereco_cep?: string | null;
  [key: string]: unknown;
}

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface ContextBuildParams {
  supabase: ServiceClient;
  tenantId: string;
  contactPhone: string;
  storeInfo: StoreIntegrationInfo | null;
  dataAccess: DataAccess;
  messageHistory: Array<{ id: string; content: string; sender_type: string; direction: string; type: string; created_at: string; metadata: unknown }>;
  contactLiCustomerId?: string | null;
}

export interface EnrichedContext {
  extractedDataContext: string;
  specificOrderInfo: string;
  customerInfo: string;
  ordersInfo: string;
  couponsInfo: string;
  cashbackInfo: string;
  productsInfo: string;
  matchedCustomer: CustomerRow | null;
  mentionedOrderNumber: string | null;
}

const ORDER_VIA_MENU_NOTE = `
=== CONSULTA DE PEDIDO ===
O cliente falou de pedido. NÃO informe dados de pedido nem diga se ele existe.
Oriente: digite *menu* e escolha "Rastrear pedido"; lá confirmamos a identidade e mostramos o status e o rastreio.
`;

/**
 * Build all enriched context sections for the AI system prompt.
 */
export async function buildEnrichedContext(params: ContextBuildParams): Promise<EnrichedContext> {
  const { supabase, tenantId, contactPhone, storeInfo, dataAccess, messageHistory, contactLiCustomerId } = params;

  // Smart search extraction
  const { mentionedOrderNumber, mentionedCpf, mentionedName } = extractFromMessages(
    messageHistory,
    dataAccess.smart_search
  );

  // ========== CUSTOMER INFO ==========
  let customerInfo = '';
  let matchedCustomer: CustomerRow | null = null;

  if (dataAccess.customer_details && storeInfo) {
    matchedCustomer = await findCustomer(supabase, storeInfo, tenantId, contactLiCustomerId, mentionedCpf, mentionedName, contactPhone);
    if (matchedCustomer) {
      customerInfo = formatCustomerMinimal(matchedCustomer);
    }
  }

  // ========== ORDERS INFO ==========
  let ordersInfo = '';
  let specificOrderInfo = '';

  if (dataAccess.orders && storeInfo && storeInfo.type === 'loja_integrada') {
    // Pedidos da Loja Integrada: o menu "Rastrear pedido" (bot-engine) consulta e confirma a identidade por CPF.
    if (mentionedOrderNumber) specificOrderInfo = ORDER_VIA_MENU_NOTE;
  } else if (dataAccess.orders && storeInfo) {
    if (mentionedOrderNumber) {
      specificOrderInfo = await buildSpecificOrderInfo(supabase, storeInfo, tenantId, mentionedOrderNumber, dataAccess, contactPhone);
    }
    if (matchedCustomer && !specificOrderInfo) {
      ordersInfo = await buildCustomerOrdersInfo(supabase, storeInfo, tenantId, matchedCustomer, dataAccess);
    }
    if (!ordersInfo && !specificOrderInfo) {
      ordersInfo = await buildPhoneOrdersInfo(supabase, storeInfo, tenantId, contactPhone, dataAccess);
    }
  }

  // ========== PRODUCTS ==========
  let productsInfo = '';
  if ((dataAccess.products_featured || dataAccess.products || dataAccess.products_catalog) && storeInfo) {
    productsInfo = await buildAvailableProductsInfo(supabase, storeInfo, tenantId, lastContactQuestion(messageHistory));
  }

  // ========== COUPONS ==========
  const couponsInfo = dataAccess.coupons
    ? await buildCouponsInfo(supabase, tenantId, contactPhone)
    : '';

  // ========== CASHBACK ==========
  const cashbackInfo = dataAccess.cashback && matchedCustomer
    ? await buildCashbackInfo(supabase, tenantId, matchedCustomer.id)
    : '';

  // ========== EXTRACTED DATA CONTEXT ==========
  const extractedDataContext = (mentionedOrderNumber || mentionedCpf || mentionedName) ? `
=== DADOS IDENTIFICADOS NAS MENSAGENS DO CLIENTE ===
${mentionedOrderNumber ? `- Número do pedido mencionado: #${mentionedOrderNumber}` : ''}
${mentionedCpf ? '- O cliente informou um CPF (por privacidade não é exibido; não o repita)' : ''}
${mentionedName ? `- Nome mencionado: ${mentionedName}` : ''}

⚠️ IMPORTANTE: O cliente pode enviar informações em mensagens separadas (ex: nome em uma mensagem, CPF em outra).
Combine todas as informações recebidas para entender o contexto completo da solicitação.
` : '';

  return {
    extractedDataContext,
    specificOrderInfo,
    customerInfo,
    ordersInfo,
    couponsInfo,
    cashbackInfo,
    productsInfo,
    matchedCustomer,
    mentionedOrderNumber,
  };
}

// ========== PRIVATE HELPERS ==========

async function findCustomer(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  contactLiCustomerId: string | null | undefined,
  mentionedCpf: string | null,
  mentionedName: string | null,
  contactPhone: string
): Promise<CustomerRow | null> {
  // Cliente ligado a este contato (o proprio dono do WhatsApp): sempre valido
  if (contactLiCustomerId && storeInfo.type === 'loja_integrada') {
    const { data: customer } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('id', contactLiCustomerId)
      .eq('tenant_id', tenantId)
      .single();
    if (customer) return customer;
  }

  // Cadastro achado por CPF/nome digitado: so vale se o telefone do cadastro for o deste contato
  if (mentionedCpf) {
    const cpfField = storeInfo.type === 'bling' ? 'cpf_cnpj' : 'cpf';
    const { data } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('tenant_id', tenantId)
      .or(`${cpfField}.eq.${mentionedCpf}`)
      .maybeSingle();
    if (data && customerOwnsPhone(data, contactPhone)) return data;
  }

  if (mentionedName) {
    const { data } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('tenant_id', tenantId)
      .ilike('nome', `%${mentionedName}%`)
      .limit(1)
      .maybeSingle();
    if (data && customerOwnsPhone(data, contactPhone)) return data;
  }

  return null;
}

async function buildSpecificOrderInfo(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  orderNumber: string,
  dataAccess: DataAccess,
  contactPhone: string
): Promise<string> {
  const { data: specificOrder, error } = await supabase
    .from(storeInfo.tables.orders)
    .select(getStoreColumns(storeInfo.tables.orders))
    .eq('tenant_id', tenantId)
    .eq('integration_id', storeInfo.integrationId)
    .eq('numero', orderNumber)
    .maybeSingle();

  if (error) log.error('❌ Specific order search error:', error);

  // Pedido so e detalhado ao dono do telefone; senao o cliente confirma identidade pelo menu (CPF)
  if (specificOrder && !customerOwnsPhone({ telefone: specificOrder.cliente_telefone }, contactPhone)) {
    return `
=== PEDIDO NÃO VINCULADO A ESTE NÚMERO ===
O cliente citou o pedido #${orderNumber}. NÃO revele nenhum dado desse pedido (nem se existe).
Diga que, para consultar pedido com segurança, ele deve voltar ao menu (digitar *menu*) e escolher "Rastrear pedido", onde confirmamos a identidade.
`;
  }

  if (specificOrder) {
    let itemsList = '  (Detalhes de itens não habilitados)';
    if (dataAccess.order_items) {
      const { data: orderItems } = await supabase
        .from(storeInfo.tables.orderItems)
        .select(getStoreColumns(storeInfo.tables.orderItems))
        .eq('order_id', specificOrder.id);
      itemsList = orderItems && orderItems.length > 0
        ? (orderItems as OrderItemRow[]).map(i => `  • ${i.quantidade}x ${i.produto_nome} - R$ ${(i.preco_subtotal || i.valor_total)?.toFixed(2) || '0,00'}`).join('\n')
        : '  Sem itens detalhados';
    }

    const createdDate = specificOrder.data_criacao
      ? new Date(specificOrder.data_criacao).toLocaleDateString('pt-BR')
      : 'Data não informada';

    const trackingCode = getTrackingCode(specificOrder, storeInfo);
    const trackingInfo = dataAccess.order_tracking
      ? `Código de Rastreio: ${trackingCode || 'Ainda não disponível'}`
      : '';

    let deliveryAddress = 'Não informado';
    if (storeInfo.type === 'bling' && specificOrder.endereco_entrega) {
      const end = specificOrder.endereco_entrega;
      deliveryAddress = `${end.municipio || ''}/${end.uf || ''}`;
    } else {
      deliveryAddress = `${specificOrder.endereco_entrega_cidade || 'Não informado'}/${specificOrder.endereco_entrega_estado || ''}`;
    }

    return `
=== 🎯 PEDIDO SOLICITADO #${specificOrder.numero} ===
⚠️ IMPORTANTE: O CLIENTE ESTÁ PERGUNTANDO ESPECIFICAMENTE SOBRE ESTE PEDIDO!
Use estas informações para responder:

📦 Pedido #${specificOrder.numero} (${createdDate}):
  Cliente: ${specificOrder.cliente_nome || 'Não informado'}
  Status Atual: ${specificOrder.situacao_nome || 'Não informado'}
  Valor Total: R$ ${specificOrder.valor_total?.toFixed(2) || '0,00'}
  Pagamento: ${specificOrder.forma_pagamento || 'Não informado'}
  Frete: R$ ${specificOrder.valor_frete?.toFixed(2) || '0,00'} (${specificOrder.forma_envio || 'Não informado'})
  Entrega para (cidade/UF): ${deliveryAddress}
  ${trackingInfo}
${dataAccess.order_items ? `  Itens:\n${itemsList}` : ''}
`;
  }

  return `
=== ⚠️ PEDIDO NÃO ENCONTRADO ===
O cliente mencionou o pedido #${orderNumber}, mas não foi encontrado no sistema.
Informe educadamente que o número pode estar incorreto e peça para verificar.
`;
}

async function buildCustomerOrdersInfo(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  customer: CustomerRow,
  dataAccess: DataAccess
): Promise<string> {
  const customerPhone = storeInfo.type === 'bling'
    ? (customer.celular || customer.telefone || '')
    : (customer.telefone_celular || '');
  const phoneDigits = customerPhone.replace(/\D/g, '').slice(-9);

  const { data: customerOrders } = await supabase
    .from(storeInfo.tables.orders)
    .select(getStoreColumns(storeInfo.tables.orders))
    .eq('tenant_id', tenantId)
    .eq('integration_id', storeInfo.integrationId)
    .or(`cliente_nome.ilike.%${customer.nome}%,cliente_telefone.ilike.%${phoneDigits}%`)
    .order('data_criacao', { ascending: false })
    .limit(5);

  if (!customerOrders || customerOrders.length === 0) return '';

  let orderItemsData: OrderItemRow[] = [];
  if (dataAccess.order_items) {
    const orderIds = (customerOrders as OrderRow[]).map(o => o.id);
    const { data } = await supabase
      .from(storeInfo.tables.orderItems)
      .select(getStoreColumns(storeInfo.tables.orderItems))
      .in('order_id', orderIds);
    orderItemsData = data || [];
  }

  return `
=== PEDIDOS DO CLIENTE ${customer.nome.toUpperCase()} ===
${(customerOrders as OrderRow[]).map(o => {
    const items = orderItemsData.filter(i => i.order_id === o.id);
    const itemsSection = dataAccess.order_items && items.length > 0
      ? `\n  Itens:\n${items.map(i => `    • ${i.quantidade}x ${i.produto_nome}`).join('\n')}`
      : '';
    const createdDate = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : 'Data não informada';
    const trackingCode = getTrackingCode(o, storeInfo);
    const trackingInfo = dataAccess.order_tracking ? `\n  Rastreio: ${trackingCode || 'Não disponível'}` : '';
    return `
📦 Pedido #${o.numero} (${createdDate}):
  Status: ${o.situacao_nome || 'Não informado'}
  Valor Total: R$ ${o.valor_total?.toFixed(2) || '0,00'}${trackingInfo}${itemsSection}`;
  }).join('\n')}
`;
}

async function buildPhoneOrdersInfo(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  contactPhone: string,
  dataAccess: DataAccess
): Promise<string> {
  const normalizedPhone = contactPhone.replace(/\D/g, '');
  const lastNineDigits = normalizedPhone.slice(-9);

  const { data: orders } = await supabase
    .from(storeInfo.tables.orders)
    .select(getStoreColumns(storeInfo.tables.orders))
    .eq('tenant_id', tenantId)
    .eq('integration_id', storeInfo.integrationId)
    .ilike('cliente_telefone', `%${lastNineDigits}%`)
    .order('data_criacao', { ascending: false })
    .limit(5);

  if (!orders || orders.length === 0) {
    return '\n=== HISTÓRICO DE PEDIDOS ===\nNenhum pedido encontrado para este cliente.\n';
  }

  let orderItemsData: OrderItemRow[] = [];
  if (dataAccess.order_items) {
    const orderIds = (orders as OrderRow[]).map(o => o.id);
    const { data } = await supabase
      .from(storeInfo.tables.orderItems)
      .select(getStoreColumns(storeInfo.tables.orderItems))
      .in('order_id', orderIds);
    orderItemsData = data || [];
  }

  return `
=== HISTÓRICO DE PEDIDOS ===
${(orders as OrderRow[]).map(o => {
    const items = orderItemsData.filter(i => i.order_id === o.id);
    const itemsSection = dataAccess.order_items && items.length > 0
      ? `\n  Itens:\n${items.map(i => `    • ${i.quantidade}x ${i.produto_nome} - R$ ${(i.preco_subtotal || i.valor_total)?.toFixed(2) || '0,00'}`).join('\n')}`
      : '';
    const createdDate = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : 'Data não informada';
    const trackingCode = getTrackingCode(o, storeInfo);
    const trackingInfo = dataAccess.order_tracking ? `\n  Rastreio: ${trackingCode || 'Não disponível'}` : '';
    return `
📦 Pedido #${o.numero} (${createdDate}):
  Status: ${o.situacao_nome || 'Não informado'}
  Valor Total: R$ ${o.valor_total?.toFixed(2) || '0,00'}
  Pagamento: ${o.forma_pagamento || 'Não informado'}
  Frete: R$ ${o.valor_frete?.toFixed(2) || '0,00'} (${o.forma_envio || 'Não informado'})${trackingInfo}${itemsSection}`;
  }).join('\n')}
`;
}
