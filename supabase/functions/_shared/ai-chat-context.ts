/**
 * ai-chat-context.ts
 * Builds enriched context (customer, orders, products, carts, coupons, cashback)
 * for AI system prompts. Extracted from ai-chat/index.ts to reduce file size.
 */

import { getStoreIntegration, getTrackingCode, type StoreIntegrationInfo } from "./ai-chat-store.ts";
import { extractFromMessages } from "./ai-chat-smart-search.ts";
import { createLogger } from "./correlation.ts";
import { COUPON_COLUMNS, getStoreColumns } from "./select-columns.ts";

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

/** Generic product row */
interface ProductRow {
  nome: string;
  preco?: number | null;
  preco_cheio?: number | null;
  preco_promocional?: number | null;
  estoque_quantidade?: number | null;
  estoque_atual?: number | null;
  categoria_nome?: string | null;
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
    matchedCustomer = await findCustomer(supabase, storeInfo, tenantId, contactLiCustomerId, mentionedCpf, mentionedName);
    if (matchedCustomer) {
      customerInfo = formatCustomerInfo(matchedCustomer, storeInfo);
    }
  }

  // ========== ORDERS INFO ==========
  let ordersInfo = '';
  let specificOrderInfo = '';

  if (dataAccess.orders && storeInfo) {
    if (mentionedOrderNumber) {
      specificOrderInfo = await buildSpecificOrderInfo(supabase, storeInfo, tenantId, mentionedOrderNumber, dataAccess);
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
  if ((dataAccess.products_featured || dataAccess.products) && storeInfo) {
    productsInfo = await buildFeaturedProductsInfo(supabase, storeInfo, tenantId);
  }
  if (dataAccess.products_catalog && storeInfo) {
    productsInfo += await buildCatalogProductsInfo(supabase, storeInfo, tenantId);
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
${mentionedCpf ? `- CPF mencionado: ${mentionedCpf}` : ''}
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
  mentionedName: string | null
): Promise<CustomerRow | null> {
  // Try linked customer first
  if (contactLiCustomerId && storeInfo.type === 'loja_integrada') {
    const { data: customer } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('id', contactLiCustomerId)
      .single();
    if (customer) return customer;
  }

  // Try CPF match
  if (mentionedCpf) {
    const cpfField = storeInfo.type === 'bling' ? 'cpf_cnpj' : 'cpf';
    const { data } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('tenant_id', tenantId)
      .or(`${cpfField}.eq.${mentionedCpf}`)
      .maybeSingle();
    if (data) return data;
  }

  // Try name match
  if (mentionedName) {
    const { data } = await supabase
      .from(storeInfo.tables.customers)
      .select(getStoreColumns(storeInfo.tables.customers))
      .eq('tenant_id', tenantId)
      .ilike('nome', `%${mentionedName}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

function formatCustomerInfo(customer: CustomerRow, storeInfo: StoreIntegrationInfo): string {
  let address = 'Não informado';
  if (storeInfo.type === 'bling' && customer.endereco) {
    const end = customer.endereco;
    address = `${end.endereco || ''}, ${end.numero || 'S/N'} - ${end.bairro || ''}, ${end.municipio || ''}/${end.uf || ''} - CEP ${end.cep || ''}`;
  } else if (customer.endereco_logradouro) {
    address = `${customer.endereco_logradouro}, ${customer.endereco_numero || 'S/N'}${customer.endereco_complemento ? ` - ${customer.endereco_complemento}` : ''} - ${customer.endereco_bairro}, ${customer.endereco_cidade}/${customer.endereco_estado} - CEP ${customer.endereco_cep}`;
  }

  const phone = storeInfo.type === 'bling'
    ? (customer.celular || customer.telefone || 'Não informado')
    : (customer.telefone_celular || customer.telefone_principal || 'Não informado');

  const cpfCnpj = storeInfo.type === 'bling'
    ? (customer.cpf_cnpj || 'Não informado')
    : (customer.cpf || customer.cnpj || 'Não informado');

  return `
=== DADOS DO CLIENTE IDENTIFICADO ===
- Nome: ${customer.nome || 'Não informado'}
- Email: ${customer.email || 'Não informado'}
- Telefone: ${phone}
- CPF/CNPJ: ${cpfCnpj}
- Endereço: ${address}
`;
}

async function buildSpecificOrderInfo(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  orderNumber: string,
  dataAccess: DataAccess
): Promise<string> {
  const { data: specificOrder, error } = await supabase
    .from(storeInfo.tables.orders)
    .select(getStoreColumns(storeInfo.tables.orders))
    .eq('tenant_id', tenantId)
    .eq('integration_id', storeInfo.integrationId)
    .eq('numero', orderNumber)
    .maybeSingle();

  if (error) log.error('❌ Specific order search error:', error);

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
      deliveryAddress = `${end.endereco || ''}, ${end.numero || ''} - ${end.municipio || ''}/${end.uf || ''}`;
    } else {
      deliveryAddress = `${specificOrder.endereco_entrega_logradouro || ''}, ${specificOrder.endereco_entrega_numero || ''} - ${specificOrder.endereco_entrega_cidade || 'Não informado'}/${specificOrder.endereco_entrega_estado || ''}`;
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
  Endereço de Entrega: ${deliveryAddress}
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

async function buildFeaturedProductsInfo(supabase: ServiceClient, storeInfo: StoreIntegrationInfo, tenantId: string): Promise<string> {
  const productsTable = storeInfo.tables.products;
  const isLI = storeInfo.type === 'loja_integrada';

  let query = supabase
    .from(productsTable)
    .select(getStoreColumns(productsTable))
    .eq('tenant_id', tenantId);

  if (isLI) {
    query = query.eq('ativo', true).eq('destaque', true).gt('estoque_quantidade', 0);
  } else {
    query = query.eq('situacao', 'Ativo').gt('estoque_atual', 0);
  }

  const { data: featuredProducts } = await query.limit(10);
  if (!featuredProducts || featuredProducts.length === 0) return '';

  return `
=== PRODUTOS EM DESTAQUE ===
${(featuredProducts as ProductRow[]).map(p => {
    const price = isLI
      ? (p.preco_promocional ? `R$ ${p.preco_promocional.toFixed(2)} (de R$ ${p.preco_cheio?.toFixed(2) || '0,00'})` : `R$ ${p.preco_cheio?.toFixed(2) || '0,00'}`)
      : `R$ ${p.preco?.toFixed(2) || '0,00'}`;
    const stock = isLI ? p.estoque_quantidade : p.estoque_atual;
    return `- ${p.nome}: ${price} | Estoque: ${stock} unid.`;
  }).join('\n')}

💡 Use essas informações para recomendar produtos ao cliente quando apropriado.
`;
}

async function buildCatalogProductsInfo(supabase: ServiceClient, storeInfo: StoreIntegrationInfo, tenantId: string): Promise<string> {
  const productsTable = storeInfo.tables.products;
  const isLI = storeInfo.type === 'loja_integrada';

  let query = supabase
    .from(productsTable)
    .select(getStoreColumns(productsTable))
    .eq('tenant_id', tenantId);

  if (isLI) {
    query = query.eq('ativo', true).gt('estoque_quantidade', 0);
  } else {
    query = query.eq('situacao', 'Ativo').gt('estoque_atual', 0);
  }

  const { data: allProducts } = await query.limit(30);
  if (!allProducts || allProducts.length === 0) return '';

  return `
=== CATÁLOGO DE PRODUTOS (${allProducts.length} produtos disponíveis) ===
${(allProducts as ProductRow[]).map(p => {
    const price = isLI
      ? (p.preco_promocional ? `R$ ${p.preco_promocional.toFixed(2)}` : `R$ ${p.preco_cheio?.toFixed(2) || '0,00'}`)
      : `R$ ${p.preco?.toFixed(2) || '0,00'}`;
    const category = p.categoria_nome;
    const stock = isLI ? p.estoque_quantidade : p.estoque_atual;
    return `- ${p.nome} (${category || 'Sem categoria'}): ${price} | ${stock} em estoque`;
  }).join('\n')}
`;
}

async function buildCouponsInfo(supabase: ServiceClient, tenantId: string, contactPhone: string): Promise<string> {
  const couponNormalizedPhone = contactPhone.replace(/\D/g, '');
  const couponLastNineDigits = couponNormalizedPhone.slice(-9);

  const { data: coupons } = await supabase
    .from('generated_coupons')
    .select(COUPON_COLUMNS)
    .eq('tenant_id', tenantId)
    .ilike('customer_phone', `%${couponLastNineDigits}%`)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(3);

  if (!coupons || coupons.length === 0) return '';

  return `
=== CUPONS ATIVOS DO CLIENTE ===
${coupons.map((c: any) => {
    const expiresDate = new Date(c.expires_at).toLocaleDateString('pt-BR');
    return `- ${c.coupon_code}: ${c.discount_percentage}% de desconto (válido até ${expiresDate})`;
  }).join('\n')}
`;
}

async function buildCashbackInfo(supabase: ServiceClient, tenantId: string, customerId: string): Promise<string> {
  const { data: cashbackBalance } = await supabase
    .from('cashback_balances')
    .select('id, tenant_id, customer_id, balance, total_earned, total_used, updated_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (!cashbackBalance || cashbackBalance.balance <= 0) return '';

  return `
=== 💰 SALDO DE CASHBACK ===
O cliente tem R$ ${cashbackBalance.balance.toFixed(2)} de cashback disponível!
${cashbackBalance.expires_at ? `Válido até: ${new Date(cashbackBalance.expires_at).toLocaleDateString('pt-BR')}` : ''}

💡 Lembre o cliente que ele pode usar esse saldo na próxima compra!
`;
}
