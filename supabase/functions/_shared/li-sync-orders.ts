/**
 * Loja Integrada Order Sync Functions
 * Extracted from li-job-processor/index.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("li-sync-orders", "shared");

type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function syncNewOrders(
  supabase: ServiceClient, 
  authHeader: string, 
  lastDataCriacao: string | null,
  lastLiId: number,
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; synced: number; errors: string[]; debug: Record<string, unknown> }> {
  const errors: string[] = [];
  let synced = 0;
  const debug: Record<string, unknown> = { lastDataCriacao, lastLiId, apiOrders: [], comparisonResults: [] };

  try {
    // Get the highest numero from our database for this integration
    // Use li_id for ordering since numero is stored as text and can't sort numerically in Supabase
    let lastNumeroQuery = supabase
      .from('li_orders')
      .select('order_number, loja_integrada_order_id, created_at_remote')
      .order('loja_integrada_order_id', { ascending: false })
      .limit(1);
    
    if (integrationId) {
      lastNumeroQuery = lastNumeroQuery.eq('integration_id', integrationId);
    }
    
    const { data: lastOrderData } = await lastNumeroQuery.maybeSingle();
    
    // Use the li_id from parameter if higher, otherwise use from query
    const dbLastLiId = lastOrderData?.loja_integrada_order_id ? Number(lastOrderData.loja_integrada_order_id) : 0;
    const effectiveLastLiId = Math.max(lastLiId, dbLastLiId);
    const lastNumero = lastOrderData?.order_number ? parseInt(lastOrderData.order_number) : 0;
    
    debug.lastNumeroInDb = lastNumero;
    debug.lastLiIdInDb = effectiveLastLiId;
    log.info(`[DEBUG] Last order in DB: #${lastNumero} (li_id: ${effectiveLastLiId})`);

    const timestamp = Date.now();
    
    // Get total count from API first
    const countUrl = `${LI_API_BASE}/pedido?limit=1&_t=${timestamp}`;
    const countResponse = await fetch(countUrl, {
      headers: { 
        'Authorization': authHeader,
        'Cache-Control': 'no-cache'
      }
    });

    if (!countResponse.ok) {
      throw new Error(`API error: ${countResponse.status}`);
    }

    const countData = await countResponse.json();
    const totalApiOrders = countData.meta?.total_count || 0;
    debug.totalApiOrders = totalApiOrders;
    
    log.info(`[DEBUG] Total orders in API: ${totalApiOrders}, last numero in DB: ${lastNumero}`);
    
    // Fetch the most recent orders using high offset to get newest first
    // LI API rejects requests where offset + limit > ~10000
    const MAX_API_OFFSET_LIMIT = 9500;
    let ordersToFetch = Math.min(500, totalApiOrders);
    let offset = Math.max(0, totalApiOrders - ordersToFetch);
    
    // If offset exceeds API limit, reduce it and adjust ordersToFetch
    if (offset > MAX_API_OFFSET_LIMIT) {
      offset = MAX_API_OFFSET_LIMIT;
      ordersToFetch = Math.min(ordersToFetch, totalApiOrders - offset);
    }
    
    // Final safety: ensure offset + limit doesn't exceed API maximum
    if (offset + ordersToFetch > 10000) {
      ordersToFetch = Math.max(1, 10000 - offset);
    }
    
    const url = `${LI_API_BASE}/pedido?limit=${ordersToFetch}&offset=${offset}&_t=${timestamp}`;
    log.info(`[DEBUG] Fetching last ${ordersToFetch} orders with offset=${offset}`);
    
    const response = await fetch(url, {
      headers: { 
        'Authorization': authHeader,
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const orders = data.objects || [];
    log.info(`[DEBUG] API returned ${orders.length} orders`);

    if (orders.length === 0) {
      log.info(`[DEBUG] No orders returned from API`);
      return { success: true, synced: 0, errors: [], debug };
    }

    // Store for debug
    debug.apiOrders = orders.slice(0, 10).map((o: Record<string, unknown>) => ({ id: o.id, numero: o.numero }));

    // Filter by li_id - get orders with li_id greater than our last synced
    // This is more reliable than numero since li_id is always increasing
    const newOrders = orders.filter((o: Record<string, unknown>) => {
      const orderLiId = o.id ? Number(o.id) : 0;
      const isNew = orderLiId > effectiveLastLiId;
      
      if (isNew) {
        debug.comparisonResults.push({
          api_numero: o.numero,
          api_li_id: orderLiId,
          last_li_id_db: effectiveLastLiId,
          is_new: true
        });
      }
      
      return isNew;
    });
    
    log.info(`[DEBUG] Found ${newOrders.length} new orders (li_id > ${effectiveLastLiId})`);
    debug.newOrdersCount = newOrders.length;

    if (newOrders.length === 0) {
      log.info('[DEBUG] No new orders to sync');
      return { success: true, synced: 0, errors: [], debug };
    }
    
    // Sort new orders by li_id ascending so we process them in order
    newOrders.sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.id) - Number(b.id));
    log.info(`[DEBUG] Processing ${newOrders.length} new orders: #${newOrders[0]?.numero} to #${newOrders[newOrders.length - 1]?.numero}`);

    // Process each new order
    for (const orderItem of newOrders) {
      try {
        // Try dual lookup: numero first, then id
        let order = null;
        
        if (orderItem.numero) {
          const res = await fetch(`${LI_API_BASE}/pedido/${orderItem.numero}`, {
            headers: { 'Authorization': authHeader }
          });
          if (res.ok) {
            order = await res.json();
          }
        }
        
        if (!order && orderItem.id) {
          const res = await fetch(`${LI_API_BASE}/pedido/${orderItem.id}`, {
            headers: { 'Authorization': authHeader }
          });
          if (res.ok) {
            order = await res.json();
          }
        }

        if (!order) {
          // Fall back to using the basic data from listing if detail fetch fails
          log.info(`[DEBUG] Could not fetch details for order ${orderItem.numero}, using listing data`);
          
          // Try to extract customer data from orderItem.cliente (multiple formats)
          let clienteId = null;
          let clienteNome = null;
          let clienteEmail = null;
          let clienteTelefone = null;
          
          if (orderItem.cliente) {
            log.info(`[DEBUG] Order ${orderItem.numero} cliente field (fallback):`, JSON.stringify(orderItem.cliente));
            
            if (typeof orderItem.cliente === 'object' && orderItem.cliente !== null) {
              // Cliente is an object with data
              clienteId = orderItem.cliente.id ? parseInt(orderItem.cliente.id) : null;
              clienteNome = orderItem.cliente.nome || null;
              clienteEmail = orderItem.cliente.email || null;
              clienteTelefone = orderItem.cliente.telefone_celular || orderItem.cliente.telefone_principal || null;
            } else if (typeof orderItem.cliente === 'string') {
              // Cliente is a URI string like "/api/v1/cliente/12345"
              const clienteMatch = orderItem.cliente.match(/\/cliente\/(\d+)/);
              if (clienteMatch) {
                clienteId = parseInt(clienteMatch[1]);
                // Try to fetch customer details
                try {
                  const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
                    headers: { 'Authorization': authHeader }
                  });
                  if (clienteRes.ok) {
                    const cliente = await clienteRes.json();
                    clienteNome = cliente.nome || null;
                    clienteEmail = cliente.email || null;
                    clienteTelefone = cliente.telefone_celular || cliente.telefone_principal || null;
                  }
                } catch (e) {
                  log.info(`[DEBUG] Could not fetch customer ${clienteId} for fallback order`);
                }
              }
            } else if (typeof orderItem.cliente === 'number') {
              clienteId = orderItem.cliente;
            }
          }

          await supabase
            .from('li_orders')
            .upsert({
              loja_integrada_order_id: orderItem.id,
              order_number: String(orderItem.numero),
              tenant_id: tenantId,
              integration_id: integrationId,
              created_at_remote: orderItem.data_criacao,
              customer_id: clienteId ? String(clienteId) : null,
              raw_json: {
                ...orderItem,
                cliente: typeof orderItem.cliente === 'object' ? orderItem.cliente : { id: clienteId, nome: clienteNome, email: clienteEmail, telefone_celular: clienteTelefone },
              },
              updated_at_local: new Date().toISOString(),
              last_status_check_at: new Date().toISOString(),
            }, { onConflict: 'integration_id,loja_integrada_order_id' });
          
          synced++;
          log.info(`[DEBUG] ✓ Saved basic order data: #${orderItem.numero} (li_id: ${orderItem.id}, cliente: ${clienteNome || 'N/A'})`);
          continue;
        }

        // Full order processing
        await processOrder(supabase, order, tenantId, supabaseUrl, supabaseKey, authHeader, integrationId);
        synced++;
        log.info(`[DEBUG] ✓ Synced full order: #${order.numero} (li_id: ${order.id})`);
        
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Order ${orderItem.numero}: ${msg}`);
        log.error(`[DEBUG] ✗ Failed to sync order ${orderItem.numero}:`, msg);
      }
    }

    log.info(`[ORDERS] Sync complete: ${synced} new orders`);
    return { success: true, synced, errors, debug };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[ORDERS] Sync error:', msg);
    return { success: false, synced: 0, errors: [msg], debug };
  }
}

export async function processOrder(
  supabase: ServiceClient, 
  order: Record<string, unknown>, 
  tenantId: string | null, 
  supabaseUrl: string, 
  supabaseKey: string,
  authHeader: string,
  integrationId?: string | null
) {
  // Extract cliente info - handle multiple formats (object, string URI, number)
  let clienteId = null;
  let clienteNome = null;
  let clienteEmail = null;
  let clienteTelefone = null;
  let clienteCpf = null;

  if (order.cliente) {
    log.info(`[DEBUG] Order ${order.numero} cliente field:`, JSON.stringify(order.cliente));
    
    // Handle different cliente formats
    if (typeof order.cliente === 'object' && order.cliente !== null) {
      // Cliente is already an object with data
      clienteId = order.cliente.id ? parseInt(order.cliente.id) : null;
      clienteNome = order.cliente.nome || null;
      clienteEmail = order.cliente.email || null;
      clienteTelefone = order.cliente.telefone_celular || order.cliente.telefone_principal || null;
      clienteCpf = order.cliente.cpf || null;
      
      log.info(`[DEBUG] Cliente from object: id=${clienteId}, nome=${clienteNome}`);
      
      // Sync customer if we got data
      if (clienteId) {
        await supabase
          .from('li_customers')
          .upsert({
            loja_integrada_customer_id: clienteId,
            integration_id: integrationId,
            tenant_id: tenantId,
            name: clienteNome || 'Sem nome',
            email: clienteEmail || null,
            phone: order.cliente.telefone_celular || order.cliente.telefone_principal || null,
            doc: clienteCpf || order.cliente.cnpj || null,
            raw_json: order.cliente,
            updated_at_local: new Date().toISOString()
          }, { onConflict: 'integration_id,loja_integrada_customer_id' });
      }
    } else if (typeof order.cliente === 'string') {
      // Cliente is a URI string like "/api/v1/cliente/12345"
      const clienteMatch = order.cliente.match(/\/cliente\/(\d+)/);
      if (clienteMatch) {
        clienteId = parseInt(clienteMatch[1]);
        
        // Fetch cliente details from API
        try {
          const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
            headers: { 'Authorization': authHeader }
          });
          
          if (clienteRes.ok) {
            const cliente = await clienteRes.json();
            clienteNome = cliente.nome;
            clienteEmail = cliente.email;
            clienteTelefone = cliente.telefone_celular || cliente.telefone_principal;
            clienteCpf = cliente.cpf || null;
            
            log.info(`[DEBUG] Cliente from API: id=${clienteId}, nome=${clienteNome}`);

            // Sync this customer
            await supabase
              .from('li_customers')
              .upsert({
                loja_integrada_customer_id: cliente.id,
                integration_id: integrationId,
                tenant_id: tenantId,
                name: cliente.nome || 'Sem nome',
                email: cliente.email || null,
                phone: cliente.telefone_celular || cliente.telefone_principal || null,
                doc: cliente.cpf || cliente.cnpj || null,
                raw_json: cliente,
                updated_at_local: new Date().toISOString()
              }, { onConflict: 'integration_id,loja_integrada_customer_id' });
          }
        } catch (e) {
          log.info(`[DEBUG] Could not fetch customer ${clienteId}:`, e);
        }
      }
    } else if (typeof order.cliente === 'number') {
      // Cliente is just an ID number
      clienteId = order.cliente;
      
      // Fetch cliente details from API
      try {
        const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
          headers: { 'Authorization': authHeader }
        });
        
        if (clienteRes.ok) {
          const cliente = await clienteRes.json();
          clienteNome = cliente.nome;
          clienteEmail = cliente.email;
          clienteTelefone = cliente.telefone_celular || cliente.telefone_principal;
          clienteCpf = cliente.cpf || null;
          
          log.info(`[DEBUG] Cliente from API (numeric id): id=${clienteId}, nome=${clienteNome}`);

          // Sync this customer
          await supabase
            .from('li_customers')
            .upsert({
              loja_integrada_customer_id: cliente.id,
              integration_id: integrationId,
              tenant_id: tenantId,
              name: cliente.nome || 'Sem nome',
              email: cliente.email || null,
              phone: cliente.telefone_celular || cliente.telefone_principal || null,
              doc: cliente.cpf || cliente.cnpj || null,
              raw_json: cliente,
              updated_at_local: new Date().toISOString()
            }, { onConflict: 'integration_id,loja_integrada_customer_id' });
        }
      } catch (e) {
        log.info(`[DEBUG] Could not fetch customer ${clienteId}:`, e);
      }
    }
  } else {
    log.info(`[DEBUG] Order ${order.numero} has no cliente field`);
  }

  // Extract payment info
  let formaPagamento = null;
  let pagamentoTipo = null;
  let pagamentoParcelas = 1;
  let pagamentoBandeira = null;
  let pagamentoCodigo = null;
  
  if (order.pagamentos && Array.isArray(order.pagamentos) && order.pagamentos.length > 0) {
    const pagamento = order.pagamentos[0];
    formaPagamento = pagamento.forma_pagamento?.nome || pagamento.nome || null;
    pagamentoTipo = pagamento.pagamento_tipo || null;
    pagamentoCodigo = pagamento.forma_pagamento?.codigo || null;
    pagamentoBandeira = pagamento.bandeira || null;
    
    if (pagamento.parcelamento && typeof pagamento.parcelamento === 'object') {
      pagamentoParcelas = pagamento.parcelamento.numero_parcelas || pagamento.parcelamento.parcelas || 1;
    }
  }

  // Extract shipping info
  let formaEnvio = null;
  if (order.envios && Array.isArray(order.envios) && order.envios.length > 0) {
    const envio = order.envios[0];
    formaEnvio = envio.forma_envio?.nome || null;
  }

  // Build the raw_json with all API data + extracted customer info
  const rawJsonData = {
    ...order,
    // Ensure customer info is accessible at top level of raw_json
    cliente: typeof order.cliente === 'object' ? order.cliente : {
      id: clienteId,
      nome: clienteNome,
      email: clienteEmail,
      telefone_celular: clienteTelefone,
      cpf: clienteCpf,
    },
  };

  const totalsData = {
    subtotal: order.valor_subtotal ? parseFloat(order.valor_subtotal) : null,
    discount: order.valor_desconto ? parseFloat(order.valor_desconto) : null,
    shipping: order.valor_envio ? parseFloat(order.valor_envio) : null,
    total: order.valor_total ? parseFloat(order.valor_total) : null,
  };

  const paymentData = {
    forma_pagamento: formaPagamento,
    tipo: pagamentoTipo,
    parcelas: pagamentoParcelas,
    bandeira: pagamentoBandeira,
    codigo: pagamentoCodigo,
  };

  const shippingData = {
    forma_envio: formaEnvio,
    cep: order.endereco_entrega?.cep || null,
    endereco: order.endereco_entrega?.endereco || null,
    numero: order.endereco_entrega?.numero || null,
    bairro: order.endereco_entrega?.bairro || null,
    cidade: order.endereco_entrega?.cidade || null,
    estado: order.endereco_entrega?.estado || null,
  };

  const { data: orderData } = await supabase
    .from('li_orders')
    .upsert({
      loja_integrada_order_id: order.id,
      order_number: String(order.numero),
      tenant_id: tenantId,
      integration_id: integrationId,
      status_id: order.situacao?.id || null,
      status_name: order.situacao?.nome || null,
      customer_id: clienteId ? String(clienteId) : null,
      totals_json: totalsData,
      payment_json: paymentData,
      shipping_json: shippingData,
      items_json: order.itens || null,
      created_at_remote: order.data_criacao || null,
      updated_at_remote: order.data_modificacao || null,
      raw_json: rawJsonData,
      updated_at_local: new Date().toISOString(),
      last_status_check_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,loja_integrada_order_id' })
    .select()
    .single();

  // Sync order items if available
  if (order.itens && Array.isArray(order.itens) && orderData) {
    await supabase
      .from('li_order_items')
      .delete()
      .eq('order_id', orderData.id);

    const itemsData = order.itens.map((item: Record<string, unknown>) => {
      let productId = null;
      if (item.produto) {
        const productMatch = typeof item.produto === 'string' 
          ? item.produto.match?.(/\/produto\/(\d+)/)
          : null;
        if (productMatch) {
          productId = parseInt(productMatch[1]);
        }
      }
      return {
        order_id: orderData.id,
        tenant_id: tenantId,
        loja_integrada_product_id: productId,
        name: item.nome || 'Item',
        sku: item.sku || null,
        qty: parseInt(item.quantidade) || 1,
        price: parseFloat(item.preco_venda || item.preco_cheio) || 0,
        raw_json: item,
      };
    });

    if (itemsData.length > 0) {
      await supabase.from('li_order_items').insert(itemsData);
    }
  }

  // Check for cashback trigger
  const situacaoNome = order.situacao?.nome || '';
  
  // FIX: Add tenant_id filter to ensure correct config per tenant
  const { data: cashbackConfig } = await supabase
    .from('cashback_configs')
    .select('trigger_statuses, is_active, id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  log.info(`[CASHBACK] Order #${order.numero} status: "${situacaoNome}", config: ${!!cashbackConfig}, triggers: ${JSON.stringify(cashbackConfig?.trigger_statuses || [])}`);

  if (cashbackConfig && cashbackConfig.is_active && cashbackConfig.trigger_statuses?.length > 0) {
    const triggerStatuses = cashbackConfig.trigger_statuses as string[];
    const shouldTrigger = triggerStatuses.some(
      triggerStatus => situacaoNome.toLowerCase() === triggerStatus.toLowerCase()
    );
    
    log.info(`[CASHBACK] Should trigger: ${shouldTrigger}`);
    
    if (shouldTrigger && order.valor_total) {
      // FIX: Add tenant_id filter to prevent duplicate coupons across tenants
      const { data: existingCoupon } = await supabase
        .from('generated_coupons')
        .select('id')
        .eq('order_id', String(order.numero))
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!existingCoupon) {
        log.info(`[CASHBACK] Triggering cashback for order #${order.numero}`);
        try {
          // FIX: Include tenant_id in payload for proper isolation
          const cashbackPayload = {
            order_id: order.id,
            order_number: String(order.numero),
            customer_name: clienteNome || 'Cliente',
            customer_email: clienteEmail || '',
            customer_phone: clienteTelefone || '',
            customer_cpf: clienteCpf || '',
            order_total: parseFloat(order.valor_total),
            tenant_id: tenantId
          };

          const cashbackRes = await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(cashbackPayload)
          });
          
          const cashbackResult = await cashbackRes.json();
          log.info(`[CASHBACK] Result for order #${order.numero}:`, JSON.stringify(cashbackResult));
        } catch (e) {
          log.error(`[CASHBACK] Failed to trigger for order #${order.numero}:`, e);
        }
      } else {
        log.info(`[CASHBACK] Coupon already exists for order #${order.numero}`);
      }
    }
  }

  // Check for order notification triggers on NEW orders
  if (situacaoNome && tenantId && integrationId && orderData) {
    log.info(`[NEW-ORDER-NOTIFICATION] Checking notifications for new order #${order.numero}, status: "${situacaoNome}"`);
    
    const dbOrderForNotification = {
      ...orderData,
      numero: order.numero,
      cliente_nome: order.cliente?.nome || 'Cliente',
      cliente_telefone: order.cliente?.telefone_celular || order.cliente?.telefone_principal || '',
      cliente_email: order.cliente?.email || '',
      codigo_rastreio: '',
      url_rastreio: '',
      valor_total: order.valor_total ? parseFloat(order.valor_total) : 0,
      li_id: order.id,
    };
    
    await processOrderNotificationsInJob(
      supabase,
      order,
      dbOrderForNotification,
      situacaoNome,
      tenantId,
      integrationId
    );
  }
}

export async function updateOrderStatuses(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; updated: number; checked: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  let checked = 0;

  try {
    // Get orders that need status check using intelligent rotation
    // Prioritize orders not checked recently (by last_status_check_at)
    // Final statuses - match partial words to handle "Pedido Cancelado", "Pedido Entregue", etc.
    const finalStatusKeywords = ['cancelado', 'entregue', 'devolvido'];
    
    // FIX: Reduced from 30 min to 5 min for faster sync - orders should reflect LI status quickly
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // First, get total count of pending orders for coverage stats
    let countQuery = supabase
      .from('li_orders')
      .select('id', { count: 'exact', head: true });
    
    if (integrationId) {
      countQuery = countQuery.eq('integration_id', integrationId);
    }
    
    const { count: totalPendingCount } = await countQuery;
    
    // FIX: Increased limit from 100 to 200 and reduced check interval to 5 min
    // This ensures orders sync faster and reflect LI status in near real-time
    // Fetch orders ordered by data_criacao (newest first)
    // Check ALL orders that haven't been checked in last 5 min
    // We MUST verify even "canceled" orders because they may have been updated in LI
    let ordersQuery = supabase
      .from('li_orders')
      .select('id, loja_integrada_order_id, order_number, status_id, status_name, created_at_remote, last_status_check_at, integration_id, raw_json, totals_json, shipping_json')
      .or(`last_status_check_at.is.null,last_status_check_at.lt.${fiveMinutesAgo}`)
      .order('created_at_remote', { ascending: false })
      .limit(200);
    
    if (integrationId) {
      ordersQuery = ordersQuery.eq('integration_id', integrationId);
    }
    
    const { data: ordersToCheck, error: fetchError } = await ordersQuery;
    
    if (fetchError) {
      log.error('[STATUS-UPDATE] Error fetching orders:', fetchError);
      return { success: false, updated: 0, checked: 0, errors: [fetchError.message] };
    }
    
    if (!ordersToCheck || ordersToCheck.length === 0) {
      log.info('[STATUS-UPDATE] No orders need status check (all checked within 5 min)');
      return { success: true, updated: 0, checked: 0, errors: [] };
    }
    
    // Orders are now pre-filtered in SQL - no need for JS filter
    const pendingOrders = ordersToCheck;
    
    log.info(`[STATUS-UPDATE] Checking ${pendingOrders.length} orders (filtered in SQL, total pending: ${totalPendingCount || 'unknown'})`);
    if (pendingOrders.length > 0) {
      const neverChecked = pendingOrders.filter((o: Record<string, unknown>) => !o.last_status_check_at).length;
      log.info(`[STATUS-UPDATE] ${neverChecked} never checked, rotating by last_status_check_at`);
      log.info(`[STATUS-UPDATE] First 3: ${pendingOrders.slice(0, 3).map((o: Record<string, unknown>) => `#${o.order_number}:${o.status_name}`).join(', ')}`);
    }
    
    // Debug: Log first order API check
    let firstDebugLogged = false;
    
    for (const order of pendingOrders) {
      checked++;
      
      try {
        // Fetch current status from Loja Integrada API using order_number
        const response = await fetch(`${LI_API_BASE}/pedido/${order.order_number}`, {
          headers: { 
            'Authorization': authHeader,
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          log.info(`[STATUS-UPDATE] Failed to fetch order #${order.order_number}: ${response.status}`);
          continue;
        }
        
        const apiOrder = await response.json();
        
        // Debug: Log first order's API response structure
        if (!firstDebugLogged) {
          log.info(`[STATUS-UPDATE] API response sample for #${order.order_number}: situacao=${JSON.stringify(apiOrder.situacao)}`);
          firstDebugLogged = true;
        }
        
        // Compare status - use status_id/status_name from new schema
        const currentStatusId = order.status_id;
        const currentStatusNome = order.status_name;
        
        // API may return situacao as object {id, nome, resource_uri} or string URL
        let apiStatusId: number | null = null;
        let apiStatusNome: string | null = null;
        
        if (apiOrder.situacao) {
          if (typeof apiOrder.situacao === 'object') {
            apiStatusId = apiOrder.situacao.id;
            apiStatusNome = apiOrder.situacao.nome;
          } else if (typeof apiOrder.situacao === 'string') {
            // It's a resource_uri like "/api/v1/situacao/15"
            const situacaoMatch = apiOrder.situacao.match(/\/situacao\/(\d+)/);
            if (situacaoMatch) {
              apiStatusId = parseInt(situacaoMatch[1], 10);
            }
          }
        }
        
        // If we got situacao_id but not nome, try to fetch situacao details
        if (apiStatusId && !apiStatusNome) {
          try {
            const situacaoRes = await fetch(`${LI_API_BASE}/situacao/${apiStatusId}`, {
              headers: { 'Authorization': authHeader }
            });
            if (situacaoRes.ok) {
              const situacao = await situacaoRes.json();
              apiStatusNome = situacao.nome || null;
            }
          } catch {
            // Keep apiStatusNome as null
          }
        }
        
        // ALWAYS UPDATE ALL FIELDS - Full sync approach
        // Extract tracking info from envios
        let codigoRastreio = null;
        let urlRastreio = null;
        
        if (apiOrder.envios && Array.isArray(apiOrder.envios) && apiOrder.envios.length > 0) {
          const envio = apiOrder.envios[0];
          codigoRastreio = envio.codigo_rastreamento || envio.objeto || envio.rastreamento || null;
          urlRastreio = envio.url_rastreio || envio.url_rastreamento || envio.link_rastreamento || null;
        }
        
        // Extract existing raw_json data and merge with API response
        const existingRaw = order.raw_json || {};
        const currentTrackingCode = existingRaw.codigo_rastreio || null;
        
        // Build update using new schema - store everything in raw_json
        const mergedRaw = {
          ...existingRaw,
          ...apiOrder,
          codigo_rastreio: codigoRastreio || currentTrackingCode,
          url_rastreio: urlRastreio || existingRaw.url_rastreio || null,
        };
        
        const updateData: Record<string, unknown> = {
          status_id: apiStatusId || order.status_id,
          status_name: apiStatusNome || order.status_name,
          raw_json: mergedRaw,
          updated_at_local: new Date().toISOString(),
          last_status_check_at: new Date().toISOString(),
        };
        
        // Update totals if available
        if (apiOrder.valor_total != null || apiOrder.valor_subtotal != null) {
          updateData.totals_json = {
            ...(order.totals_json || {}),
            subtotal: apiOrder.valor_subtotal != null ? parseFloat(apiOrder.valor_subtotal) : (order.totals_json?.subtotal || 0),
            total: apiOrder.valor_total != null ? parseFloat(apiOrder.valor_total) : (order.totals_json?.total || 0),
            shipping: apiOrder.valor_envio != null ? parseFloat(apiOrder.valor_envio) : (order.totals_json?.shipping || 0),
            discount: apiOrder.valor_desconto != null ? parseFloat(apiOrder.valor_desconto) : (order.totals_json?.discount || 0),
          };
        }
        
        // Log if there are meaningful changes
        const statusChanged = apiStatusId !== null && (apiStatusId !== currentStatusId || apiStatusNome !== currentStatusNome);
        const currentTrackingCode2 = (order.raw_json as Record<string, unknown>)?.codigo_rastreio || null;
        const trackingChanged = codigoRastreio && codigoRastreio !== currentTrackingCode2;
        
        // DEBUG: Always log status comparison for order 9908
        if (order.order_number === '9908' || order.order_number === 9908) {
          log.info(`[DEBUG-9908] Status check: currentId=${currentStatusId}, apiId=${apiStatusId}, currentNome="${currentStatusNome}", apiNome="${apiStatusNome}", changed=${statusChanged}`);
        }
        
        if (statusChanged) {
          log.info(`[FULL-SYNC] Order #${order.order_number} status: "${currentStatusNome}" -> "${apiStatusNome}"`);
        }
        if (trackingChanged) {
          log.info(`[FULL-SYNC] Order #${order.order_number} tracking: ${codigoRastreio}`);
        }
        
        // FIX: Track coupon usage - check if order has a coupon that matches one we generated
        // BUG FIX: Ensure orderCouponCode is a string before calling toUpperCase
        const rawCouponCode = apiOrder.cupom_desconto || (order.raw_json?.cupom_desconto);
        const orderCouponCode = rawCouponCode ? String(rawCouponCode).trim() : null;
        
        if (orderCouponCode && tenantId) {
          // Check if this coupon exists in our generated_coupons and mark as used
          const { data: matchedCoupon } = await supabase
            .from('generated_coupons')
            .select('id, used_at, coupon_code')
            .eq('coupon_code', orderCouponCode.toUpperCase())
            .eq('tenant_id', tenantId)
            .is('used_at', null)
            .maybeSingle();
          
          if (matchedCoupon) {
            log.info(`[COUPON-TRACKING] Order #${order.order_number} used coupon ${orderCouponCode}, marking as used`);
            await supabase
              .from('generated_coupons')
              .update({
                used_at: new Date().toISOString(),
                used_in_order_id: String(order.order_number),
                used_order_value: apiOrder.valor_total ? parseFloat(apiOrder.valor_total) : (order.totals_json?.total || 0)
              })
              .eq('id', matchedCoupon.id);
          }
        }
        
        // ALWAYS update the order with all latest data
        const { error: updateError } = await supabase
          .from('li_orders')
          .update(updateData)
          .eq('id', order.id);
        
        if (updateError) {
          log.error(`[FULL-SYNC] Error updating order #${order.order_number}:`, updateError);
          errors.push(`Order ${order.order_number}: ${updateError.message}`);
        } else {
          updated++;
          if (statusChanged || trackingChanged) {
            log.info(`[FULL-SYNC] Updated order #${order.order_number} with all latest data`);
          }
        }
        
        // FIX: Check for cashback trigger when status changes (with integration_id filter)
        if (statusChanged && apiStatusNome && tenantId && order.integration_id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          
          // FIX: Filter by integration_id to get the correct cashback config for this store
          const { data: cashbackConfig } = await supabase
            .from('cashback_configs')
            .select('trigger_statuses, is_active, id, integration_id, send_via_whatsapp, whatsapp_integration_id')
            .eq('tenant_id', tenantId)
            .eq('integration_id', order.integration_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          
          if (cashbackConfig?.trigger_statuses?.length > 0) {
            const shouldTrigger = (cashbackConfig.trigger_statuses as string[]).some(
              (trigger: string) => apiStatusNome!.toLowerCase() === trigger.toLowerCase()
            );
            
            log.info(`[STATUS-CASHBACK] Order #${order.order_number} new status "${apiStatusNome}", integration: ${order.integration_id}, trigger check: ${shouldTrigger}`);
            
            if (shouldTrigger) {
              // Check if coupon already exists
              const { data: existingCoupon } = await supabase
                .from('generated_coupons')
                .select('id')
                .eq('order_id', String(order.order_number))
                .eq('tenant_id', tenantId)
                .maybeSingle();
              
              if (!existingCoupon) {
                // Fetch order details for customer info
                const orderDetails = apiOrder;
                let customerName = 'Cliente';
                let customerEmail = '';
                let customerPhone = '';
                let customerCpf = '';
                
                if (orderDetails.cliente) {
                  if (typeof orderDetails.cliente === 'object') {
                    customerName = orderDetails.cliente.nome || 'Cliente';
                    customerEmail = orderDetails.cliente.email || '';
                    customerPhone = orderDetails.cliente.telefone_celular || orderDetails.cliente.telefone_principal || '';
                    customerCpf = orderDetails.cliente.cpf || '';
                  }
                }
                
                log.info(`[STATUS-CASHBACK] Triggering cashback for order #${order.order_number}, config: ${cashbackConfig.id}`);
                
                try {
                  // FIX: Include integration_id in payload for proper store isolation
                  const cashbackPayload = {
                    order_id: orderDetails.id,
                    order_number: String(order.order_number),
                    customer_name: customerName,
                    customer_email: customerEmail,
                    customer_phone: customerPhone,
                    customer_cpf: customerCpf,
                    order_total: parseFloat(orderDetails.valor_total || '0'),
                    tenant_id: tenantId,
                    integration_id: order.integration_id
                  };
                  
                  const cashbackRes = await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify(cashbackPayload)
                  });
                  
                  const cashbackResult = await cashbackRes.json();
                  log.info(`[STATUS-CASHBACK] Result for order #${order.order_number}:`, JSON.stringify(cashbackResult));
                } catch (e) {
                  log.error(`[STATUS-CASHBACK] Failed for order #${order.order_number}:`, e);
                }
              } else {
                log.info(`[STATUS-CASHBACK] Coupon already exists for order #${order.order_number}`);
              }
            }
          }
        }
        
        // FIX: Check for order notification triggers when status changes
        if (statusChanged && apiStatusNome && tenantId && order.integration_id) {
          log.info(`[ORDER-NOTIFICATION] Triggering notification check for order #${order.order_number}, status: "${apiStatusNome}", tenant: ${tenantId}, integration: ${order.integration_id}`);
          
          // IMPORTANT: Build dbOrder-like object with data from raw_json for notification processing
          const rawData = order.raw_json || {};
          const orderForNotification = {
            ...order,
            numero: order.order_number,
            cliente_nome: rawData.cliente?.nome || 'Cliente',
            cliente_telefone: rawData.cliente?.telefone_celular || rawData.cliente?.telefone_principal || '',
            cliente_email: rawData.cliente?.email || '',
            codigo_rastreio: codigoRastreio || rawData.codigo_rastreio || '',
            url_rastreio: urlRastreio || rawData.url_rastreio || '',
            valor_total: order.totals_json?.total || 0,
            li_id: order.loja_integrada_order_id,
            shipping_json: order.shipping_json || null,
            raw_json: order.raw_json || null,
          };
          
          await processOrderNotificationsInJob(
            supabase, 
            apiOrder, 
            orderForNotification,
            apiStatusNome, 
            tenantId,
            order.integration_id
          );
        } else if (statusChanged) {
          log.info(`[ORDER-NOTIFICATION] Skipped notification for order #${order.order_number} - missing: tenantId=${!!tenantId}, integrationId=${!!order.integration_id}, statusName=${!!apiStatusNome}`);
        }
        
        // Small delay to avoid API rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        log.error(`[STATUS-UPDATE] Error checking order #${order.order_number}:`, errorMsg);
        errors.push(`Order ${order.order_number}: ${errorMsg}`);
      }
    }
    
    log.info(`[STATUS-UPDATE] Completed: checked ${checked} orders, updated ${updated} statuses`);
    return { success: true, updated, checked, errors };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[STATUS-UPDATE] Error:', errorMsg);
    return { success: false, updated, checked, errors: [errorMsg] };
  }
}

