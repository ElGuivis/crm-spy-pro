import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

// Module-level logger (overridden per-request with correlation ID)
let log = createLogger("li-reconciliation-processor", "init");

const LI_API_BASE = 'https://api.awsli.com.br/v1';
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY = 300;
// Process at most this many records per entity per invocation
const MAX_PER_ENTITY = 50;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string, authHeader: string): Promise<Response> {
  const now = Date.now();
  const timeSince = now - lastRequestTime;
  if (timeSince < RATE_LIMIT_DELAY) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY - timeSince));
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, { headers: { 'Authorization': authHeader } });
  if (response.status === 429) {
    log.warn('[RECONCILIATION] Rate limited, waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));
    lastRequestTime = Date.now();
    return fetch(url, { headers: { 'Authorization': authHeader } });
  }
  return response;
}

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  log = createLogger("li-reconciliation-processor", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Record<string, unknown>[] = [];

    // Get all connected LI integrations
    let integrationQuery = supabase.from('integrations')
      .select('id, api_key, tenant_id')
      .eq('type', 'loja_integrada').eq('status', 'connected')
      .not('api_key', 'is', null)
      .limit(10);

    // Scope to user's tenant when called by authenticated user
    if (!auth.isInternal && auth.tenantId) {
      integrationQuery = integrationQuery.eq('tenant_id', auth.tenantId);
    }

    const { data: integrations } = await integrationQuery;

    for (const integration of (integrations || [])) {
      const integrationId = integration.id;
      const tenantId = integration.tenant_id;
      const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;

      log.info(`[RECONCILIATION] Processing integration ${integrationId}`);

      // 1. Reconcile orders
      try {
        const ordersSynced = await reconcileEntity(supabase, integrationId, tenantId, authHeader, 'orders');
        results.push({ integration: integrationId, type: 'orders', synced: ordersSynced });
      } catch (e: unknown) {
        log.error(`[RECONCILIATION] Orders failed for ${integrationId}:`, e.message);
        results.push({ integration: integrationId, type: 'orders', error: e.message });
      }

      // 2. Reconcile products
      try {
        const productsSynced = await reconcileEntity(supabase, integrationId, tenantId, authHeader, 'products');
        results.push({ integration: integrationId, type: 'products', synced: productsSynced });
      } catch (e: unknown) {
        log.error(`[RECONCILIATION] Products failed for ${integrationId}:`, e.message);
        results.push({ integration: integrationId, type: 'products', error: e.message });
      }

      // 3. Reconcile customers
      try {
        const customersSynced = await reconcileEntity(supabase, integrationId, tenantId, authHeader, 'customers');
        results.push({ integration: integrationId, type: 'customers', synced: customersSynced });
      } catch (e: unknown) {
        log.error(`[RECONCILIATION] Customers failed for ${integrationId}:`, e.message);
        results.push({ integration: integrationId, type: 'customers', error: e.message });
      }

      // 4. Retry failed webhook events
      try {
        const retried = await retryFailedWebhooks(supabase, integrationId, tenantId, authHeader);
        if (retried > 0) results.push({ integration: integrationId, type: 'webhook_retry', retried });
      } catch (e: unknown) {
        log.error(`[RECONCILIATION] Webhook retry failed:`, e.message);
      }

      // Update integration timestamp
      await supabase.from('integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integrationId);
    }

    const totalSynced = results.reduce((s, r) => s + (r.synced || 0), 0);
    log.info(`[RECONCILIATION] Done. Total synced: ${totalSynced}`);

    return new Response(JSON.stringify({ success: true, results, totalSynced }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[RECONCILIATION] Fatal error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function reconcileEntity(
  supabase: ServiceClient, integrationId: string, tenantId: string,
  authHeader: string, entityType: 'orders' | 'products' | 'customers'
): Promise<number> {
  // Get or create sync state
  let { data: syncState } = await supabase.from('li_sync_state')
    .select('id, integration_id, entity_type, last_synced_at, last_page, status, cursor_data')
    .eq('integration_id', integrationId)
    .eq('entity_type', entityType)
    .maybeSingle();

  if (!syncState) {
    const { data } = await supabase.from('li_sync_state').insert({
      integration_id: integrationId,
      tenant_id: tenantId,
      entity_type: entityType,
    }).select().single();
    syncState = data;
  }

  const lastCursor = syncState?.last_cursor || null;
  const savedOffset = syncState?.last_offset || 0;
  const apiEndpoint = entityType === 'orders' ? 'pedido' : entityType === 'customers' ? 'cliente' : 'produto';
  let synced = 0;
  let hasMore = true;
  let offset = savedOffset;
  let latestTimestamp = lastCursor;

  log.info(`[RECONCILIATION] ${entityType}: resuming from offset=${offset}`);

  while (hasMore && synced < MAX_PER_ENTITY && offset < 20000) {
    let url = `${LI_API_BASE}/${apiEndpoint}?limit=${BATCH_SIZE}&offset=${offset}`;
    // Only use since filter if we've already completed a full pass (offset was reset to 0)
    if (lastCursor && savedOffset === 0) {
      url += `&since=${encodeURIComponent(lastCursor)}`;
    }

    const response = await rateLimitedFetch(url, authHeader);
    if (!response.ok) {
      if (response.status === 429) throw new Error('Rate limited');
      log.warn(`[RECONCILIATION] ${entityType} API returned ${response.status}`);
      break;
    }

    const data = await response.json();
    const objects = data.objects || [];

    if (objects.length === 0) {
      hasMore = false;
      break;
    }

    for (const obj of objects) {
      if (synced >= MAX_PER_ENTITY) break;
      try {
        let detail: Record<string, unknown> = obj;

        if (entityType === 'products') {
          const detailRes = await rateLimitedFetch(`${LI_API_BASE}/${apiEndpoint}/${obj.id}`, authHeader);
          if (detailRes.ok) {
            detail = await detailRes.json();
          } else if (detailRes.status !== 404) {
            continue;
          }
        } else if (entityType === 'orders') {
          // Orders: use NUMERO (not id) for detail endpoint
          const orderNumero = obj.numero || obj.id;
          const detailRes = await rateLimitedFetch(`${LI_API_BASE}/pedido/${orderNumero}`, authHeader);
          if (detailRes.ok) {
            detail = await detailRes.json();
          } else {
            log.warn(`[RECONCILIATION] Order ${orderNumero} detail returned ${detailRes.status}, using list data`);
          }
        } else if (entityType === 'customers') {
          const detailRes = await rateLimitedFetch(`${LI_API_BASE}/cliente/${obj.id}`, authHeader);
          if (detailRes.ok) {
            detail = await detailRes.json();
          } else if (detailRes.status !== 404) {
            continue;
          }
        }

        if (entityType === 'orders') {
          await upsertOrder(supabase, detail, integrationId, tenantId, authHeader);
        } else if (entityType === 'customers') {
          await upsertCustomer(supabase, detail, integrationId, tenantId);
        } else {
          await upsertProduct(supabase, detail, integrationId, tenantId);
        }
        synced++;

        const ts = detail.data_modificacao || detail.data_criacao;
        if (ts && (!latestTimestamp || ts > latestTimestamp)) {
          latestTimestamp = ts;
        }
      } catch (e: unknown) {
        log.error(`[RECONCILIATION] Failed to sync ${entityType} ${obj.id}:`, e.message);
      }
    }

    offset += objects.length;
    if (objects.length < BATCH_SIZE) hasMore = false;
  }

  // If no more data, reset offset to 0 for incremental mode next time
  const newOffset = hasMore ? offset : 0;

  // Update sync state
  if (syncState?.id) {
    await supabase.from('li_sync_state').update({
      last_cursor: latestTimestamp,
      last_offset: newOffset,
      last_synced_at: new Date().toISOString(),
      records_synced: (syncState.records_synced || 0) + synced,
      updated_at: new Date().toISOString(),
    }).eq('id', syncState.id);
  }

  log.info(`[RECONCILIATION] ${entityType}: synced ${synced} records (offset ${savedOffset} -> ${newOffset})`);
  return synced;
}

async function upsertOrder(
  supabase: ServiceClient, order: Record<string, unknown>, integrationId: string, tenantId: string, authHeader: string
) {
  // Resolve customer - handle both URI string and object format
  let customerId: string | null = null;
  if (order.cliente) {
    let clienteLiId: number | null = null;
    if (typeof order.cliente === 'string') {
      const match = order.cliente.match(/\/cliente\/(\d+)/);
      clienteLiId = match ? parseInt(match[1]) : null;
    } else if (order.cliente.id) {
      clienteLiId = Number(order.cliente.id);
    }
    if (clienteLiId) {
      const { data: existing } = await supabase.from('li_customers')
        .select('id')
        .eq('integration_id', integrationId)
        .eq('loja_integrada_customer_id', clienteLiId)
        .maybeSingle();
      customerId = existing?.id || null;
    }
  }

  // Payment info
  const paymentJson: Record<string, unknown> = {};
  if (Array.isArray(order.pagamentos) && order.pagamentos.length > 0) {
    const p = order.pagamentos[0];
    paymentJson.method = p.forma_pagamento?.nome || p.nome;
    paymentJson.gateway = p.gateway || null;
    paymentJson.installments = p.parcelamento?.numero_parcelas || 1;
    paymentJson.transaction_id = p.transacao_id || null;
    paymentJson.brand = p.bandeira || null;
  }

  // Shipping info
  const shippingJson: Record<string, unknown> = {};
  if (order.envios?.length > 0) {
    const e = order.envios[0];
    shippingJson.method = e.forma_envio?.nome || null;
    shippingJson.tracking_code = e.objeto || null;
    shippingJson.tracking_url = e.url_rastreio || null;
  }
  if (order.endereco_entrega) shippingJson.address = order.endereco_entrega;

  const itemsJson = (order.itens || []).map((item: Record<string, unknown>) => {
    const pm = typeof item.produto === 'string' ? item.produto.match(/\/produto\/(\d+)/) : null;
    return {
      product_id: pm ? parseInt(pm[1]) : null,
      sku: item.sku || null, name: item.nome || 'Item',
      qty: parseInt(item.quantidade) || 1,
      price: parseFloat(item.preco_venda || item.preco_cheio) || 0,
    };
  });

  const { data: orderData, error } = await supabase.from('li_orders').upsert({
    integration_id: integrationId, tenant_id: tenantId,
    loja_integrada_order_id: order.id,
    order_number: String(order.numero),
    status_id: order.situacao?.id || null,
    status_name: order.situacao?.nome || null,
    customer_id: customerId,
    totals_json: {
      subtotal: parseFloat(order.valor_subtotal) || 0,
      total: parseFloat(order.valor_total) || 0,
      shipping: parseFloat(order.valor_envio) || 0,
      discount: parseFloat(order.valor_desconto) || 0,
    },
    shipping_json: shippingJson, payment_json: paymentJson,
    items_json: itemsJson,
    created_at_remote: order.data_criacao || null,
    updated_at_remote: order.data_modificacao || null,
    raw_json: order,
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_order_id' }).select('id').single();

  if (error) {
    log.error(`[RECONCILIATION] Order upsert error:`, error.message);
    return;
  }

  if (orderData?.id && itemsJson.length > 0) {
    await supabase.from('li_order_items').delete().eq('order_id', orderData.id);
    await supabase.from('li_order_items').insert(itemsJson.map((item: Record<string, unknown>) => ({
      order_id: orderData.id, tenant_id: tenantId,
      loja_integrada_product_id: item.product_id,
      sku: item.sku, name: item.name, qty: item.qty, price: item.price,
      raw_json: item,
    })));
  }
}

async function upsertProduct(supabase: ServiceClient, product: Record<string, unknown>, integrationId: string, tenantId: string) {
  const { error } = await supabase.from('li_products').upsert({
    integration_id: integrationId, tenant_id: tenantId,
    loja_integrada_product_id: product.id,
    sku: product.sku || null,
    name: product.nome || 'Sem nome',
    price: parseFloat(product.preco_cheio) || null,
    promotional_price: parseFloat(product.preco_promocional) || null,
    cost_price: parseFloat(product.preco_custo) || null,
    stock: product.estoque_gerenciado ? (parseInt(product.estoque) || 0) : null,
    stock_managed: product.estoque_gerenciado || false,
    active: product.ativo !== false,
    variations_json: product.variacoes || null,
    image_url: product.imagem_principal?.grande || product.imagem_principal?.media || null,
    raw_json: product,
    updated_at_remote: product.data_modificacao || null,
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_product_id' });

  if (error) {
    log.error(`[RECONCILIATION] Product upsert error:`, error.message);
  }
}

async function upsertCustomer(supabase: ServiceClient, customer: Record<string, unknown>, integrationId: string, tenantId: string) {
  const addressJson: Record<string, unknown> = {};
  if (customer.endereco) addressJson.main = customer.endereco;
  if (customer.endereco_entrega) addressJson.shipping = customer.endereco_entrega;

  const { error } = await supabase.from('li_customers').upsert({
    integration_id: integrationId,
    tenant_id: tenantId,
    loja_integrada_customer_id: customer.id,
    name: customer.nome || 'Sem nome',
    email: customer.email || null,
    phone: customer.telefone_celular || customer.telefone_principal || null,
    doc: customer.cpf || customer.cnpj || null,
    address_json: Object.keys(addressJson).length > 0 ? addressJson : null,
    raw_json: customer,
    updated_at_remote: customer.data_modificacao || null,
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_customer_id' });

  if (error) {
    log.error(`[RECONCILIATION] Customer upsert error:`, error.message);
  }
}

async function retryFailedWebhooks(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string
): Promise<number> {
  const { data: failedEvents } = await supabase.from('li_webhook_events')
    .select('id, resource_type, resource_id, retry_count')
    .eq('integration_id', integrationId)
    .eq('status', 'failed')
    .lt('retry_count', 3)
    .order('received_at', { ascending: true })
    .limit(10);

  if (!failedEvents?.length) return 0;

  let retried = 0;
  for (const event of failedEvents) {
    try {
      await supabase.from('li_webhook_events')
        .update({ status: 'processing', retry_count: (event.retry_count || 0) + 1 })
        .eq('id', event.id);

      if (event.resource_type === 'order' && event.resource_id) {
        const res = await rateLimitedFetch(`${LI_API_BASE}/pedido/${event.resource_id}`, authHeader);
        if (res.ok) {
          const order = await res.json();
          await upsertOrder(supabase, order, integrationId, tenantId, authHeader);
        }
      } else if (event.resource_type === 'product' && event.resource_id) {
        const res = await rateLimitedFetch(`${LI_API_BASE}/produto/${event.resource_id}`, authHeader);
        if (res.ok) {
          const product = await res.json();
          await upsertProduct(supabase, product, integrationId, tenantId);
        }
      }

      await supabase.from('li_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', event.id);
      retried++;
    } catch (e: unknown) {
      await supabase.from('li_webhook_events')
        .update({ status: 'failed', error: e.message })
        .eq('id', event.id);
    }
  }

  return retried;
}
