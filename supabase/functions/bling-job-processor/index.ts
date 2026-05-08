import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import type { BlingConnectionRecord, ServiceClient } from "../_shared/supabase-types.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
const RATE_LIMIT_DELAY = 400;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function ensureValidToken(supabase: ServiceClient, connection: Record<string, unknown>): Promise<string> {
  return ensureBlingToken(supabase, connection, '[BLING-JOB]');
}

function safeParseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr === '' || dateStr === 'null') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// Fetch order details
async function fetchOrderDetails(accessToken: string, orderId: number): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${BLING_API_BASE}/pedidos/vendas/${orderId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  
  if (!response.ok) return null;
  const result = await response.json();
  return result.data || null;
}

// Fetch product details (for stock update)
async function fetchProductDetails(accessToken: string, productId: number): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${BLING_API_BASE}/produtos/${productId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  
  if (!response.ok) return null;
  const result = await response.json();
  return result.data || null;
}

// Sync new products incrementally
async function syncNewProducts(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string,
  lastBlingId: number
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch latest products (first 2 pages only for incremental)
    const allProducts: Record<string, unknown>[] = [];
    
    for (let page = 1; page <= 2; page++) {
      const response = await fetch(
        `${BLING_API_BASE}/produtos?pagina=${page}&limite=100`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
      );
      
      if (!response.ok) {
        if (response.status === 429) throw new Error('RATE_LIMITED');
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      const products = result.data || [];
      allProducts.push(...products);
      
      if (products.length < 100) break;
      await delay(RATE_LIMIT_DELAY);
    }

    log.info(`[BLING-JOB] Fetched ${allProducts.length} products from API`);

    // Filter to only new products (bling_id > lastBlingId)
    const newProducts = allProducts.filter((p: Record<string, unknown>) => p.id > lastBlingId);
    log.info(`[BLING-JOB] Found ${newProducts.length} new products (bling_id > ${lastBlingId})`);

    if (newProducts.length === 0) {
      return { success: true, synced: 0, errors: [] };
    }

    // Process each new product
    for (const product of newProducts) {
      try {
        const productData = {
          bling_id: product.id,
          nome: product.nome,
          codigo: product.codigo,
          preco: product.preco,
          preco_custo: product.precoCusto,
          estoque_atual: product.estoque?.saldoVirtualTotal ?? product.estoque?.saldoFisicoTotal ?? 0,
          estoque_minimo: product.estoque?.minimo ?? null,
          situacao: product.situacao,
          tipo: product.tipo,
          formato: product.formato,
          unidade: product.unidade || null,
          gtin: product.gtin || null,
          gtin_embalagem: product.gtinEmbalagem || null,
          ean: product.ean || null,
          imagem_url: product.imagemURL || null,
          // Campos adicionais
          condicao: product.condicao ?? null,
          frete_gratis: product.freteGratis === true,
          sob_encomenda: product.sobEncomenda === true,
          tenant_id: tenantId,
          integration_id: integrationId,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('bling_products')
          .upsert(productData, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });

        if (error) {
          errors.push(`Product ${product.nome}: ${error.message}`);
        } else {
          synced++;
          log.info(`[BLING-JOB] ✓ Synced new product: ${product.nome} (bling_id: ${product.id})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Product ${product.nome}: ${msg}`);
      }
    }

    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Product sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}

// Update stock for existing products
async function updateProductStock(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    // Get products that were synced more than 15 minutes ago (stale stock - reduced from 1 hour)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data: staleProducts, error: fetchError } = await supabase
      .from('bling_products')
      .select('id, bling_id, nome')
      .eq('integration_id', integrationId)
      .lt('synced_at', fifteenMinutesAgo)
      .order('synced_at', { ascending: true }) // Prioritize oldest first
      .limit(100); // Process max 100 products per run (increased from 30)

    if (fetchError) {
      throw new Error(`Failed to fetch stale products: ${fetchError.message}`);
    }

    if (!staleProducts || staleProducts.length === 0) {
      log.info('[BLING-JOB] No stale products to update stock');
      return { success: true, updated: 0, errors: [] };
    }

    log.info(`[BLING-JOB] Updating stock for ${staleProducts.length} products`);

    for (const product of staleProducts) {
      try {
        const details = await fetchProductDetails(accessToken, product.bling_id);
        await delay(RATE_LIMIT_DELAY);

        if (!details) {
          errors.push(`Product ${product.nome}: Failed to fetch details`);
          continue;
        }

        // Extract stock and pricing info
        const updateData: Record<string, unknown> = {
          estoque_atual: details.estoque?.saldoVirtualTotal || 0,
          preco: details.preco,
          preco_custo: details.precoCusto,
          situacao: details.situacao,
          synced_at: new Date().toISOString(),
        };

        // Also update estoque_depositos if available
        if (details.estoque?.depositos) {
          updateData.estoque_depositos = details.estoque.depositos;
        }

        const { error: updateError } = await supabase
          .from('bling_products')
          .update(updateData)
          .eq('id', product.id);

        if (updateError) {
          errors.push(`Product ${product.nome}: ${updateError.message}`);
        } else {
          updated++;
          log.info(`[BLING-JOB] ✓ Updated stock for: ${product.nome} (stock: ${updateData.estoque_atual})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Product ${product.nome}: ${msg}`);
      }
    }

    return { success: true, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Stock update error:', msg);
    return { success: false, updated: 0, errors: [msg] };
  }
}

// Sync customers from orders - extracts unique customer IDs and fetches their details
async function syncCustomersFromOrders(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Get unique cliente_ids from orders that are not yet in bling_customers
    const { data: orders } = await supabase
      .from('bling_orders')
      .select('cliente_id')
      .eq('integration_id', integrationId)
      .not('cliente_id', 'is', null);

    if (!orders || orders.length === 0) {
      log.info('[BLING-JOB] No orders found for customer sync');
      return { success: true, synced: 0, errors: [] };
    }

    // Get unique client IDs
    const uniqueClientIds = [...new Set(orders.map((o: Record<string, unknown>) => o.cliente_id).filter(Boolean))] as number[];
    log.info(`[BLING-JOB] Found ${uniqueClientIds.length} unique customer IDs in orders`);

    // Get already synced customer bling_ids
    const { data: existingCustomers } = await supabase
      .from('bling_customers')
      .select('bling_id')
      .eq('integration_id', integrationId)
      .in('bling_id', uniqueClientIds);

    const existingIds = new Set((existingCustomers || []).map((c: Record<string, unknown>) => c.bling_id));
    const newClientIds = uniqueClientIds.filter(id => !existingIds.has(id));
    
    log.info(`[BLING-JOB] ${newClientIds.length} new customers to sync (${existingIds.size} already exist)`);

    if (newClientIds.length === 0) {
      return { success: true, synced: 0, errors: [] };
    }

    // Limit to 20 customers per run to avoid timeouts
    const clientsToSync = newClientIds.slice(0, 20);

    for (const clientId of clientsToSync) {
      try {
        const response = await fetch(`${BLING_API_BASE}/contatos/${clientId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
        });
        
        await delay(RATE_LIMIT_DELAY);

        if (!response.ok) {
          if (response.status === 404) {
            log.info(`[BLING-JOB] Customer ${clientId} not found, skipping`);
            continue;
          }
          errors.push(`Customer ${clientId}: API error ${response.status}`);
          continue;
        }

        const result = await response.json();
        const customer = result.data;

        if (!customer) {
          errors.push(`Customer ${clientId}: No data returned`);
          continue;
        }

        const customerData = {
          bling_id: customer.id,
          nome: customer.nome || 'Cliente sem nome',
          fantasia: customer.fantasia,
          tipo_pessoa: customer.tipo,
          cpf_cnpj: customer.numeroDocumento,
          ie: customer.ie,
          rg: customer.rg,
          orgao_emissor: customer.orgaoEmissor,
          email: customer.email,
          telefone: customer.telefone,
          celular: customer.celular,
          endereco: customer.endereco || null,
          data_nascimento: safeParseDate(customer.dataNascimento),
          sexo: customer.sexo,
          naturalidade: customer.naturalidade,
          situacao: customer.situacao,
          data_inclusao: safeParseDate(customer.dataInclusao),
          raw_data: customer,
          tenant_id: tenantId,
          integration_id: integrationId,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('bling_customers')
          .upsert(customerData, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });

        if (error) {
          errors.push(`Customer ${customer.nome}: ${error.message}`);
        } else {
          synced++;
          log.info(`[BLING-JOB] ✓ Synced customer: ${customer.nome} (bling_id: ${customer.id})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Customer ${clientId}: ${msg}`);
      }
    }

    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Customer sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}

// Sync new orders incrementally
async function syncNewOrders(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string,
  storeIds: number[] | null,
  lastBlingId: number
): Promise<{ success: boolean; synced: number; errors: string[]; debug: Record<string, unknown> }> {
  const errors: string[] = [];
  let synced = 0;
  const debug: Record<string, unknown> = { lastBlingId, newOrders: [] };

  try {
    // Fetch latest orders (first 2 pages only for incremental)
    const allOrders: Record<string, unknown>[] = [];
    
    for (let page = 1; page <= 2; page++) {
      const response = await fetch(
        `${BLING_API_BASE}/pedidos/vendas?pagina=${page}&limite=100`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }
      );
      
      if (!response.ok) {
        if (response.status === 429) throw new Error('RATE_LIMITED');
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      const orders = result.data || [];
      allOrders.push(...orders);
      
      if (orders.length < 100) break;
      await delay(RATE_LIMIT_DELAY);
    }

    log.info(`[BLING-JOB] Fetched ${allOrders.length} orders from API`);

    // Filter by store if specified
    let filteredOrders = allOrders;
    if (storeIds && storeIds.length > 0) {
      filteredOrders = allOrders.filter((o: Record<string, unknown>) => o.loja?.id && storeIds.includes(o.loja.id));
      log.info(`[BLING-JOB] Filtered to ${filteredOrders.length} orders for stores: ${storeIds.join(', ')}`);
    }

    // Filter to only new orders (bling_id > lastBlingId)
    const newOrders = filteredOrders.filter((o: Record<string, unknown>) => o.id > lastBlingId);
    debug.newOrdersCount = newOrders.length;
    
    log.info(`[BLING-JOB] Found ${newOrders.length} new orders (bling_id > ${lastBlingId})`);

    if (newOrders.length === 0) {
      return { success: true, synced: 0, errors: [], debug };
    }

    // Sort by bling_id ascending
    newOrders.sort((a: Record<string, unknown>, b: Record<string, unknown>) => a.id - b.id);
    debug.newOrders = newOrders.slice(0, 5).map((o: Record<string, unknown>) => ({ id: o.id, numero: o.numero }));

    // Process each new order
    for (const orderSummary of newOrders) {
      try {
        const orderDetails = await fetchOrderDetails(accessToken, orderSummary.id);
        await delay(RATE_LIMIT_DELAY);
        
        const order = orderDetails || orderSummary;

        // Get situacao name - prefer nome field over valor
        const situacaoId = order.situacao?.id;
        let situacaoNome = order.situacao?.valor;
        if (order.situacao?.nome) {
          situacaoNome = order.situacao.nome;
        }

        const orderData = {
          bling_id: order.id,
          numero: order.numero || String(order.id),
          data_criacao: safeParseDate(order.data),
          data_modificacao: safeParseDate(order.dataAlteracao),
          situacao_id: situacaoId,
          situacao_nome: situacaoNome,
          cliente_id: order.contato?.id,
          cliente_nome: order.contato?.nome,
          cliente_cpf_cnpj: order.contato?.numeroDocumento,
          cliente_email: order.contato?.email,
          cliente_telefone: order.contato?.telefone || order.contato?.celular,
          valor_total: order.total,
          valor_desconto: order.desconto?.valor || 0,
          valor_frete: order.transporte?.frete || 0,
          valor_produtos: order.totalProdutos,
          forma_pagamento: order.pagamento?.formaPagamento?.descricao || 
                          (order.parcelas?.[0]?.formaPagamento?.descricao) ||
                          null,
          forma_envio: order.transporte?.transportador,
          observacoes: order.observacoes,
          observacoes_internas: order.observacoesInternas,
          endereco_entrega: order.transporte?.enderecoEntrega || null,
          loja_id: order.loja?.id,
          loja_nome: order.loja?.nome,
          numero_loja: order.numeroLoja,
          data_saida: safeParseDate(order.dataSaida),
          data_prevista: safeParseDate(order.dataPrevista),
          outras_despesas: order.outrasDespesas || 0,
          numero_pedido_compra: order.numeroPedidoCompra,
          categoria_id: order.categoria?.id,
          nota_fiscal_id: order.notaFiscal?.id,
          total_icms: order.tributacao?.totalICMS || 0,
          total_ipi: order.tributacao?.totalIPI || 0,
          vendedor_id: order.vendedor?.id,
          intermediador_cnpj: order.intermediador?.cnpj,
          intermediador_nome_usuario: order.intermediador?.nomeUsuario,
          taxa_comissao: order.taxas?.taxaComissao || 0,
          custo_frete: order.taxas?.custoFrete || 0,
          valor_base: order.taxas?.valorBase || 0,
          frete_por_conta: order.transporte?.fretePorConta,
          quantidade_volumes: order.transporte?.quantidadeVolumes,
          peso_bruto: order.transporte?.pesoBruto,
          prazo_entrega: order.transporte?.prazoEntrega,
          transportador_id: order.transporte?.contato?.id,
          transportador_nome: order.transporte?.contato?.nome,
          etiqueta: order.transporte?.etiqueta || null,
          volumes: order.transporte?.volumes || null,
          parcelas: order.parcelas || null,
          raw_data: order,
          tenant_id: tenantId,
          integration_id: integrationId,
          synced_at: new Date().toISOString(),
        };

        const { error, data: upsertedOrder } = await supabase
          .from('bling_orders')
          .upsert(orderData, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false })
          .select('id')
          .single();

        if (error) {
          errors.push(`Order ${order.numero}: ${error.message}`);
        } else {
          synced++;
          log.info(`[BLING-JOB] ✓ Synced order #${order.numero} (bling_id: ${order.id})`);

          // Sync order items
          const items = order.itens || [];
          if (items.length > 0 && upsertedOrder) {
            await supabase.from('bling_order_items').delete().eq('order_id', upsertedOrder.id);

            const itemsToInsert = items.map((item: Record<string, unknown>) => ({
              order_id: upsertedOrder.id,
              bling_id: item.id,
              produto_id: item.produto?.id,
              produto_nome: item.descricao || item.produto?.nome,
              sku: item.codigo,
              quantidade: item.quantidade,
              valor_unitario: item.valor,
              valor_total: (item.quantidade || 1) * (item.valor || 0),
              desconto: item.desconto?.valor || 0,
              preco_custo: item.produto?.precoCusto || 0,
              unidade: item.unidade,
              aliquota_ipi: item.aliquotaIPI || 0,
              descricao_detalhada: item.descricaoDetalhada,
              natureza_operacao_id: item.naturezaOperacao?.id,
              comissao_base: item.comissao?.base || 0,
              comissao_aliquota: item.comissao?.aliquota || 0,
              comissao_valor: item.comissao?.valor || 0,
              raw_data: item,
              tenant_id: tenantId,
            }));

            await supabase.from('bling_order_items').insert(itemsToInsert);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Order ${orderSummary.numero}: ${msg}`);
      }
    }

    return { success: true, synced, errors, debug };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Sync error:', msg);
    return { success: false, synced: 0, errors: [msg], debug };
  }
}

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("bling-job-processor", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let requestBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText) requestBody = JSON.parse(bodyText);
    } catch { /* ignore */ }

    log.info(`[BLING-JOB] Auth successful (isInternal=${auth.isInternal}), processing...`);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Record<string, unknown>[] = [];

    const specifiedIntegrationId = requestBody.integrationId || null;
    const specifiedSyncType = requestBody.syncType || null;

    // Get Bling integrations - check by bling_connections status instead
    // First get all connected bling_connections
    const { data: connectedConnections } = await supabase
      .from('bling_connections')
      .select('tenant_id')
      .eq('status', 'connected');
    
    const connectedTenantIds = (connectedConnections || []).map(c => c.tenant_id);
    
    // Get Bling integrations with auto-sync enabled that have connected bling_connections
    let integrationQuery = supabase
      .from('integrations')
      .select(`
        id, tenant_id, bling_store_ids,
        auto_sync_orders, auto_sync_orders_interval, last_sync_orders_at,
        auto_sync_products, auto_sync_products_interval, last_sync_products_at,
        auto_sync_customers, auto_sync_customers_interval, last_sync_customers_at,
        initial_sync_completed
      `)
      .eq('type', 'bling');

    if (specifiedIntegrationId) {
      integrationQuery = integrationQuery.eq('id', specifiedIntegrationId);
    } else {
      // For auto-sync: check if tenant has connected bling_connection and has Record<string, unknown> auto-sync enabled
      integrationQuery = integrationQuery
        .eq('initial_sync_completed', true)
        .or('auto_sync_orders.eq.true,auto_sync_products.eq.true,auto_sync_customers.eq.true')
        .in('tenant_id', connectedTenantIds.length > 0 ? connectedTenantIds : ['none']);
    }

    const { data: integrations } = await integrationQuery.limit(10);

    for (const integration of (integrations || [])) {
      const intId = integration.id;
      const tenantId = integration.tenant_id;

      // Check if sync should run based on interval
      if (!isManualRequest) {
        const lastSync = integration.last_sync_orders_at ? new Date(integration.last_sync_orders_at).getTime() : 0;
        const intervalMs = (integration.auto_sync_orders_interval || 5) * 60 * 1000;
        if (Date.now() - lastSync < intervalMs) {
          log.info(`[BLING-JOB] Skipping ${intId}, interval not reached`);
          continue;
        }
      }

      // Get Bling connection
      const { data: connection } = await supabase
        .from('bling_connections')
        .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, bling_company_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!connection) {
        log.info(`[BLING-JOB] No connection found for integration ${intId}`);
        continue;
      }

      try {
        const accessToken = await ensureValidToken(supabase, connection);

        // Sync orders (if enabled or manually requested)
        const shouldSyncOrders = specifiedSyncType === 'orders' || 
          (!specifiedSyncType && integration.auto_sync_orders);
        
        if (shouldSyncOrders) {
          const lastOrderSync = integration.last_sync_orders_at ? new Date(integration.last_sync_orders_at).getTime() : 0;
          const orderIntervalMs = (integration.auto_sync_orders_interval || 5) * 60 * 1000;
          const orderIntervalReached = isManualRequest || (Date.now() - lastOrderSync >= orderIntervalMs);

          if (orderIntervalReached) {
            // Get last synced order bling_id
            const { data: lastOrder } = await supabase
              .from('bling_orders')
              .select('bling_id')
              .eq('integration_id', intId)
              .order('bling_id', { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastOrderBlingId = lastOrder?.bling_id || 0;
            log.info(`[BLING-JOB] Processing orders for ${intId}, last bling_id: ${lastOrderBlingId}`);

            const storeIds = integration.bling_store_ids || null;
            const ordersResult = await syncNewOrders(supabase, accessToken, intId, tenantId, storeIds, lastOrderBlingId);
            results.push({ type: 'incremental_orders', integrationId: intId, ...ordersResult });

            // Always update timestamps on every check, not just when new data is found
            await supabase
              .from('integrations')
              .update({ 
                last_sync_orders_at: new Date().toISOString(),
                last_sync_at: new Date().toISOString()
              })
              .eq('id', intId);
          }
        }

        // Sync new products (if enabled or manually requested)
        const shouldSyncProducts = specifiedSyncType === 'products' || 
          (!specifiedSyncType && integration.auto_sync_products);
        
        // Calculate product interval outside the if block so it can be used for stock update
        const lastProductSync = integration.last_sync_products_at ? new Date(integration.last_sync_products_at).getTime() : 0;
        const productIntervalMs = (integration.auto_sync_products_interval || 15) * 60 * 1000;
        const productIntervalReached = isManualRequest || (Date.now() - lastProductSync >= productIntervalMs);

        if (shouldSyncProducts && productIntervalReached) {
          // Get last synced product bling_id
          const { data: lastProduct } = await supabase
            .from('bling_products')
            .select('bling_id')
            .eq('integration_id', intId)
            .order('bling_id', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastProductBlingId = lastProduct?.bling_id || 0;
          log.info(`[BLING-JOB] Processing new products for ${intId}, last bling_id: ${lastProductBlingId}`);

          const productsResult = await syncNewProducts(supabase, accessToken, intId, tenantId, lastProductBlingId);
          results.push({ type: 'incremental_products', integrationId: intId, ...productsResult });

          // Always update timestamps on every check, not just when new data is found
          await supabase
            .from('integrations')
            .update({ 
              last_sync_products_at: new Date().toISOString(),
              last_sync_at: new Date().toISOString()
            })
            .eq('id', intId);
        }

        // Update stock for existing products (if manually requested or during auto-sync with products)
        const shouldUpdateStock = specifiedSyncType === 'products_stock' || 
          (shouldSyncProducts && productIntervalReached);
        
        if (shouldUpdateStock) {
          log.info(`[BLING-JOB] Updating product stock for ${intId}`);
          const stockResult = await updateProductStock(supabase, accessToken, intId, tenantId);
          results.push({ type: 'stock_update', integrationId: intId, ...stockResult });
        }

        // Sync customers from orders (if enabled or manually requested)
        const shouldSyncCustomers = specifiedSyncType === 'customers' || 
          (!specifiedSyncType && integration.auto_sync_customers);
        
        if (shouldSyncCustomers) {
          const lastCustomerSync = integration.last_sync_customers_at ? new Date(integration.last_sync_customers_at).getTime() : 0;
          const customerIntervalMs = (integration.auto_sync_customers_interval || 15) * 60 * 1000;
          const customerIntervalReached = isManualRequest || (Date.now() - lastCustomerSync >= customerIntervalMs);

          if (customerIntervalReached) {
            log.info(`[BLING-JOB] Syncing customers from orders for ${intId}`);
            const customersResult = await syncCustomersFromOrders(supabase, accessToken, intId, tenantId);
            results.push({ type: 'incremental_customers', integrationId: intId, ...customersResult });

            // Always update timestamps on every check
            await supabase
              .from('integrations')
              .update({ 
                last_sync_customers_at: new Date().toISOString(),
                last_sync_at: new Date().toISOString()
              })
              .eq('id', intId);
          }
        }

      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        log.error(`[BLING-JOB] Error processing ${intId}:`, msg);
        results.push({ type: 'error', integrationId: intId, error: msg });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${results.length} tasks, synced ${totalSynced} records`,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
