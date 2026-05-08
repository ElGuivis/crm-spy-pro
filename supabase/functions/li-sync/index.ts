import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';
const PAGE_SIZE = 50;
const RATE_LIMIT_DELAY = 300;
const MAX_ORDERS_PER_RUN = 500;
const MAX_ITEMS_PER_RUN = 500;

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
    log.warn('[LI-SYNC] Rate limited, waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));
    lastRequestTime = Date.now();
    return fetch(url, { headers: { 'Authorization': authHeader } });
  }
  return response;
}

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("li-sync", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty */ }

    const { syncType, integrationId, action } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    let integration: Record<string, unknown> | null = null;
    if (integrationId) {
      // IDOR protection: validate integration belongs to user's tenant on user calls
      if (!auth.isInternal && auth.tenantId) {
        await requireResource(supabase, "integrations", integrationId as string, auth.tenantId, req);
      }

      // Build query with tenant scope when caller is a user
      let query = supabase.from('integrations')
        .select('id, api_key, tenant_id, last_sync_at, metadata')
        .eq('id', integrationId);
      if (!auth.isInternal && auth.tenantId) {
        query = query.eq('tenant_id', auth.tenantId);
      }
      const { data } = await query.maybeSingle();
      integration = data;
    } else {
      let query = supabase.from('integrations')
        .select('id, api_key, tenant_id, last_sync_at, metadata')
        .eq('type', 'loja_integrada').eq('status', 'connected')
        .not('tenant_id', 'is', null);
      if (!auth.isInternal && auth.tenantId) {
        query = query.eq('tenant_id', auth.tenantId);
      }
      const { data } = await query.limit(1).maybeSingle();
      integration = data;
    }

    if (!integration?.api_key) {
      throw new Error('No connected Loja Integrada integration found');
    }

    const intId = integration.id;
    const tenantId = integration.tenant_id;
    const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;

    // Handle register-webhook action
    if (action === 'register-webhook') {
      log.info(`[LI-SYNC] Registering webhooks for integration ${intId}`);
      const result = await registerWebhooks(supabase, intId, authHeader, supabaseUrl);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[LI-SYNC] Starting sync - type: ${syncType || 'all'}, integration: ${integrationId}`);

    const syncId = crypto.randomUUID();

    EdgeRuntime.waitUntil(runFullSync(supabase, intId, tenantId, authHeader, syncType || 'all', syncId));

    return new Response(JSON.stringify({
      success: true,
      message: 'Sincronização iniciada',
      syncId,
      isFirstSync: !integration.last_sync_at,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[LI-SYNC] Error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getOrCreateSyncState(supabase: ServiceClient, integrationId: string, tenantId: string, entityType: string) {
  let { data } = await supabase.from('li_sync_state')
    .select('id, integration_id, entity_type, last_synced_at, last_offset, current_page, total_pages, sync_status, extra')
    .eq('integration_id', integrationId)
    .eq('entity_type', entityType)
    .maybeSingle();

  if (!data) {
    const { data: created } = await supabase.from('li_sync_state').insert({
      integration_id: integrationId, tenant_id: tenantId,
      entity_type: entityType,
    }).select().single();
    data = created;
  }
  return data;
}

async function updateSyncState(supabase: ServiceClient, stateId: string, updates: Record<string, unknown>) {
  await supabase.from('li_sync_state').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', stateId);
}

async function runFullSync(
  supabase: ServiceClient, integrationId: string, tenantId: string,
  authHeader: string, syncType: string, syncId: string
) {
  const types = syncType === 'all' ? ['customers', 'products', 'orders'] : [syncType];
  const results: Record<string, number> = {};

  for (const type of types) {
    try {
      log.info(`[LI-SYNC] Starting ${type} sync...`);
      let synced = 0;

      if (type === 'customers') {
        synced = await syncAllCustomers(supabase, integrationId, tenantId, authHeader);
      } else if (type === 'products') {
        synced = await syncAllProducts(supabase, integrationId, tenantId, authHeader);
      } else if (type === 'orders') {
        synced = await syncAllOrders(supabase, integrationId, tenantId, authHeader);
      }

      results[type] = synced;
      log.info(`[LI-SYNC] ${type}: synced ${synced} records`);

      const state = await getOrCreateSyncState(supabase, integrationId, tenantId, type);
      if (state?.id) {
        await updateSyncState(supabase, state.id, {
          last_synced_at: new Date().toISOString(),
          last_cursor: new Date().toISOString(),
          records_synced: synced,
        });
      }
    } catch (e: unknown) {
      log.error(`[LI-SYNC] ${type} failed:`, e.message);
      results[type] = -1;
    }
  }

  await supabase.from('integrations').update({
    last_sync_at: new Date().toISOString(),
    initial_sync_completed: true,
    error_message: null,
  }).eq('id', integrationId);

  // Auto-register webhooks after successful sync
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;
    const { data: intData } = await supabase.from('integrations')
      .select('api_key, metadata').eq('id', integrationId).single();
    if (intData?.api_key) {
      const authH = `chave_api ${intData.api_key} aplicacao ${appKey}`;
      const existingMeta = (intData.metadata && typeof intData.metadata === 'object') ? intData.metadata as Record<string, unknown> : {};
      if (!existingMeta.webhooks_registered_at) {
        log.info('[LI-SYNC] Auto-registering webhooks after sync...');
        await registerWebhooks(supabase, integrationId, authH, supabaseUrl);
      }
    }
  } catch (webhookErr: unknown) {
    log.error('[LI-SYNC] Auto-register webhooks failed (non-fatal):', webhookErr.message);
  }

  log.info('[LI-SYNC] Full sync completed:', results);
}

// =================== CUSTOMERS ===================
async function syncAllCustomers(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string
): Promise<number> {
  let synced = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore && synced < MAX_ITEMS_PER_RUN) {
    const res = await rateLimitedFetch(`${LI_API_BASE}/cliente?limit=${PAGE_SIZE}&offset=${offset}`, authHeader);
    if (!res.ok) break;
    const data = await res.json();
    const objects = data.objects || [];
    if (objects.length === 0) break;

    for (const obj of objects) {
      try {
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/cliente/${obj.id}`, authHeader);
        if (!detailRes.ok) continue;
        const c = await detailRes.json();

        const enderecos = Array.isArray(c.enderecos) ? c.enderecos : [];
        const principalAddr = enderecos.find((e: Record<string, unknown>) => e.principal) || enderecos[0] || null;

        await supabase.from('li_customers').upsert({
          integration_id: integrationId, tenant_id: tenantId,
          loja_integrada_customer_id: c.id,
          name: c.nome || 'Sem nome',
          email: c.email,
          phone: c.telefone_celular || c.telefone_principal,
          doc: c.cpf || c.cnpj || null,
          address_json: principalAddr,
          raw_json: c,
          updated_at_remote: c.data_modificacao || null,
          updated_at_local: new Date().toISOString(),
        }, { onConflict: 'integration_id,loja_integrada_customer_id' });
        synced++;
      } catch (e: unknown) {
        log.error(`[LI-SYNC] Customer ${obj.id} error:`, e.message);
      }
    }

    offset += objects.length;
    hasMore = objects.length >= PAGE_SIZE;
  }
  return synced;
}

// =================== PRODUCTS ===================
async function syncAllProducts(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string
): Promise<number> {
  let synced = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore && synced < MAX_ITEMS_PER_RUN) {
    const res = await rateLimitedFetch(`${LI_API_BASE}/produto?limit=${PAGE_SIZE}&offset=${offset}`, authHeader);
    if (!res.ok) break;
    const data = await res.json();
    const objects = data.objects || [];
    if (objects.length === 0) break;

    for (const obj of objects) {
      try {
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/produto/${obj.id}`, authHeader);
        if (!detailRes.ok) continue;
        const p = await detailRes.json();

        await supabase.from('li_products').upsert({
          integration_id: integrationId, tenant_id: tenantId,
          loja_integrada_product_id: p.id,
          sku: p.sku || null,
          name: p.nome || 'Sem nome',
          price: parseFloat(p.preco_cheio) || null,
          promotional_price: parseFloat(p.preco_promocional) || null,
          cost_price: parseFloat(p.preco_custo) || null,
          stock: p.estoque_gerenciado ? (parseInt(p.estoque) || 0) : null,
          stock_managed: p.estoque_gerenciado || false,
          active: p.ativo !== false,
          variations_json: p.variacoes || null,
          image_url: p.imagem_principal?.grande || p.imagem_principal?.media || null,
          raw_json: p,
          updated_at_remote: p.data_modificacao || null,
          updated_at_local: new Date().toISOString(),
        }, { onConflict: 'integration_id,loja_integrada_product_id' });
        synced++;
      } catch (e: unknown) {
        log.error(`[LI-SYNC] Product ${obj.id} error:`, e.message);
      }
    }

    offset += objects.length;
    hasMore = objects.length >= PAGE_SIZE;
  }
  return synced;
}

// =================== ORDERS ===================
async function syncAllOrders(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string
): Promise<number> {
  // Get saved offset to resume from where we left off
  const { data: syncState } = await supabase.from('li_sync_state')
    .select('id, integration_id, entity_type, last_synced_at, last_offset, current_page, total_pages, sync_status, extra')
    .eq('integration_id', integrationId)
    .eq('entity_type', 'orders')
    .maybeSingle();

  let synced = 0;
  let offset = syncState?.last_offset || 0;
  let hasMore = true;
  const startOffset = offset;

  log.info(`[LI-SYNC] Orders: resuming from offset=${offset}`);

  while (hasMore && synced < MAX_ORDERS_PER_RUN) {
    // Use /pedido/search which returns fuller data
    const url = `${LI_API_BASE}/pedido/search?limit=${PAGE_SIZE}&offset=${offset}`;
    log.info(`[LI-SYNC] Fetching orders: offset=${offset}, synced=${synced}`);
    const res = await rateLimitedFetch(url, authHeader);
    
    let objects: Record<string, unknown>[] = [];
    
    if (!res.ok) {
      // Fallback to non-search endpoint
      const fallbackUrl = `${LI_API_BASE}/pedido?limit=${PAGE_SIZE}&offset=${offset}`;
      const fallbackRes = await rateLimitedFetch(fallbackUrl, authHeader);
      if (!fallbackRes.ok) {
        log.error(`[LI-SYNC] Orders API returned ${fallbackRes.status}`);
        break;
      }
      const fallbackData = await fallbackRes.json();
      objects = fallbackData.objects || [];
    } else {
      const data = await res.json();
      objects = data.objects || [];
      log.info(`[LI-SYNC] Orders page: ${objects.length} objects, total=${data.meta?.total_count || 'N/A'}`);
    }

    if (objects.length === 0) {
      // All orders fetched, reset offset for next full sync
      offset = 0;
      hasMore = false;
      log.info(`[LI-SYNC] All orders fetched, resetting offset to 0`);
      break;
    }

    for (const obj of objects) {
      if (synced >= MAX_ORDERS_PER_RUN) break;
      try {
        // Fetch full details using order NUMBER (not id) - the LI API uses numero as identifier
        const orderNumero = obj.numero || obj.id;
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/pedido/${orderNumero}`, authHeader);
        let orderData: Record<string, unknown>;
        
        if (detailRes.ok) {
          orderData = await detailRes.json();
        } else {
          // Fallback to list data if detail fails
          log.warn(`[LI-SYNC] Order ${orderNumero} detail returned ${detailRes.status}, using list data`);
          orderData = obj;
        }

        await upsertOrderFromData(supabase, orderData, integrationId, tenantId);
        synced++;
        if (synced % 50 === 0) {
          log.info(`[LI-SYNC] Orders progress: ${synced} synced`);
        }
      } catch (e: unknown) {
        log.error(`[LI-SYNC] Order ${obj.id} error:`, e.message);
      }
    }

    offset += objects.length;
    hasMore = objects.length >= PAGE_SIZE && synced < MAX_ORDERS_PER_RUN;
  }

  // Save the current offset so next run resumes from here
  if (syncState?.id) {
    await supabase.from('li_sync_state').update({
      last_offset: offset,
      updated_at: new Date().toISOString(),
    }).eq('id', syncState.id);
  }

  log.info(`[LI-SYNC] Orders batch complete: ${synced} synced (offset ${startOffset} -> ${offset})`);
  return synced;
}

async function upsertOrderFromData(
  supabase: ServiceClient, order: Record<string, unknown>, integrationId: string, tenantId: string
) {
  // Resolve customer ID
  let customerId: string | null = null;
  const clienteRef = order.cliente;
  let clienteNome: string | null = null;
  let clienteEmail: string | null = null;
  let clienteTelefone: string | null = null;
  let clienteDoc: string | null = null;

  if (clienteRef) {
    if (typeof clienteRef === 'object' && clienteRef !== null) {
      // Full detail response has cliente as object
      clienteNome = clienteRef.nome || null;
      clienteEmail = clienteRef.email || null;
      clienteTelefone = clienteRef.telefone_celular || clienteRef.telefone_principal || null;
      clienteDoc = clienteRef.cpf || clienteRef.cnpj || null;
      const clienteLiId = clienteRef.id;
      if (clienteLiId) {
        const { data: existing } = await supabase.from('li_customers')
          .select('id')
          .eq('integration_id', integrationId)
          .eq('loja_integrada_customer_id', clienteLiId)
          .maybeSingle();
        customerId = existing?.id || null;
      }
    } else if (typeof clienteRef === 'string') {
      const clienteMatch = clienteRef.match(/\/cliente\/(\d+)/);
      const clienteLiId = clienteMatch ? parseInt(clienteMatch[1]) : null;
      if (clienteLiId) {
        const { data: existing } = await supabase.from('li_customers')
          .select('id, name, raw_json')
          .eq('integration_id', integrationId)
          .eq('loja_integrada_customer_id', clienteLiId)
          .maybeSingle();
        customerId = existing?.id || null;
        if (existing) {
          clienteNome = existing.name || null;
          const cRaw = existing.raw_json;
          if (cRaw && typeof cRaw === 'object') {
            clienteEmail = (cRaw as Record<string, unknown>).email || null;
            clienteTelefone = (cRaw as Record<string, unknown>).telefone_celular || (cRaw as Record<string, unknown>).telefone_principal || null;
            clienteDoc = (cRaw as Record<string, unknown>).cpf || (cRaw as Record<string, unknown>).cnpj || null;
          }
        }
      }
    }
  }

  // Payment info - full detail has pagamentos array with nested objects
  const paymentJson: Record<string, unknown> = {};
  if (Array.isArray(order.pagamentos) && order.pagamentos.length > 0) {
    const p = order.pagamentos[0];
    const formaPag = typeof p.forma_pagamento === 'object' ? p.forma_pagamento : null;
    paymentJson.method = formaPag?.nome || p.forma_pagamento || p.nome || null;
    paymentJson.gateway = p.gateway || null;
    paymentJson.installments = p.parcelamento?.numero_parcelas || p.parcelas || 1;
    paymentJson.transaction_id = p.transacao_id || null;
    paymentJson.brand = p.bandeira || null;
    paymentJson.type = formaPag?.codigo || p.tipo || null;
    paymentJson.valor = p.valor || null;
    paymentJson.data_pagamento = p.data_confirmacao || p.data || null;
    paymentJson.all_payments = order.pagamentos;
  }

  // Shipping info
  const shippingJson: Record<string, unknown> = {};
  if (Array.isArray(order.envios) && order.envios.length > 0) {
    const envio = order.envios[0];
    const formaEnvio = typeof envio.forma_envio === 'object' ? envio.forma_envio : null;
    shippingJson.method = formaEnvio?.nome || envio.forma_envio || null;
    shippingJson.tracking_code = envio.objeto || null;
    shippingJson.tracking_url = envio.url_rastreio || null;
    shippingJson.data_envio = envio.data_envio || envio.data || null;
    shippingJson.all_envios = order.envios;
  }
  if (order.endereco_entrega) {
    if (typeof order.endereco_entrega === 'object') {
      shippingJson.address = order.endereco_entrega;
      shippingJson.nome_destinatario = order.endereco_entrega.nome || null;
      shippingJson.telefone_destinatario = order.endereco_entrega.telefone || null;
    } else {
      shippingJson.address = order.endereco_entrega;
    }
  }
  shippingJson.peso_real = order.peso_real ? parseFloat(order.peso_real) : null;

  // Items - full detail has itens array with nested produto objects
  const itemsJson = (order.itens || []).map((item: Record<string, unknown>) => {
    let productId: number | null = null;
    let productName = item.nome || 'Item';
    let sku = item.sku || null;
    let imageUrl = null;
    let variacao = null;

    if (typeof item.produto === 'string') {
      const pm = item.produto.match(/\/produto\/(\d+)/);
      productId = pm ? parseInt(pm[1]) : null;
    } else if (typeof item.produto === 'object' && item.produto) {
      productId = item.produto.id || null;
      productName = item.produto.nome || productName;
      sku = item.produto.sku || sku;
      imageUrl = item.produto.imagem_principal?.grande || item.produto.imagem_principal?.media || null;
    }

    if (item.variacao) {
      variacao = typeof item.variacao === 'object' ? item.variacao.nome : item.variacao;
    }

    return {
      product_id: productId,
      sku,
      name: productName,
      qty: parseInt(item.quantidade) || 1,
      price: parseFloat(item.preco_venda || item.preco_cheio) || 0,
      preco_custo: parseFloat(item.preco_custo) || null,
      preco_promocional: parseFloat(item.preco_promocional) || null,
      peso: parseFloat(item.peso) || null,
      imagem_url: imageUrl,
      variacao,
    };
  });

  // Status
  let statusId: number | null = null;
  let statusName: string | null = null;
  if (order.situacao) {
    if (typeof order.situacao === 'object') {
      statusId = order.situacao.id || null;
      statusName = order.situacao.nome || null;
    } else if (typeof order.situacao === 'string') {
      const sitMatch = order.situacao.match(/\/situacao\/pedido\/(\d+)/);
      if (sitMatch) statusId = parseInt(sitMatch[1]);
    }
  }

  const orderNumber = String(order.numero || order.id);

  const { data: orderRow, error: orderError } = await supabase.from('li_orders').upsert({
    integration_id: integrationId, tenant_id: tenantId,
    loja_integrada_order_id: order.id,
    order_number: orderNumber,
    status_id: statusId,
    status_name: statusName,
    customer_id: customerId,
    totals_json: {
      subtotal: parseFloat(order.valor_subtotal) || 0,
      total: parseFloat(order.valor_total) || 0,
      shipping: parseFloat(order.valor_envio) || 0,
      discount: parseFloat(order.valor_desconto) || 0,
    },
    shipping_json: shippingJson,
    payment_json: paymentJson,
    items_json: itemsJson,
    created_at_remote: order.data_criacao || null,
    updated_at_remote: order.data_modificacao || null,
    raw_json: {
      ...order,
      // Flatten key customer fields for easy frontend access
      cliente_nome: clienteNome,
      cliente_email: clienteEmail,
      cliente_telefone: clienteTelefone,
      cliente_cpf_cnpj: clienteDoc,
      cupom_desconto: order.cupom_desconto || null,
      observacoes: order.observacoes || null,
      numero_nota_fiscal: order.numero_nota_fiscal || null,
      data_expiracao: order.data_expiracao || null,
    },
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_order_id' }).select('id').single();

  if (orderError) {
    log.error(`[LI-SYNC] Order upsert error for ${orderNumber}:`, orderError.message);
    return;
  }

  // Upsert order items
  if (orderRow?.id && itemsJson.length > 0) {
    await supabase.from('li_order_items').delete().eq('order_id', orderRow.id);
    await supabase.from('li_order_items').insert(itemsJson.map((item: Record<string, unknown>) => ({
      order_id: orderRow.id, tenant_id: tenantId,
      loja_integrada_product_id: item.product_id,
      sku: item.sku, name: item.name, qty: item.qty, price: item.price,
      raw_json: item,
    })));
  }
}

// =================== WEBHOOK REGISTRATION ===================
async function registerWebhooks(
  supabase: ServiceClient, integrationId: string, authHeader: string, supabaseUrl: string
): Promise<{ success: boolean; message: string; webhooks_registered?: string[] }> {
  const webhookToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
  const notifyUrl = `${supabaseUrl}/functions/v1/li-webhook`;
  const registered: string[] = [];
  const errors: string[] = [];

  // Register for pedido (orders)
  try {
    const res = await fetch('https://api.awsli.com.br/webhooks/v1/pedido', {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notifyUrl, token: webhookToken }),
    });
    if (res.ok) {
      registered.push('pedido');
      log.info('[LI-SYNC] Webhook registered for pedido');
    } else {
      const errText = await res.text();
      errors.push(`pedido: ${res.status} ${errText}`);
      log.error(`[LI-SYNC] Failed to register pedido webhook: ${res.status}`, errText);
    }
  } catch (e: unknown) {
    errors.push(`pedido: ${e.message}`);
  }

  // Register for produto (products)
  try {
    const res = await fetch('https://api.awsli.com.br/webhooks/v1/produto', {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notifyUrl, token: webhookToken }),
    });
    if (res.ok) {
      registered.push('produto');
      log.info('[LI-SYNC] Webhook registered for produto');
    } else {
      const errText = await res.text();
      errors.push(`produto: ${res.status} ${errText}`);
      log.error(`[LI-SYNC] Failed to register produto webhook: ${res.status}`, errText);
    }
  } catch (e: unknown) {
    errors.push(`produto: ${e.message}`);
  }

  // Register for cliente (customers)
  try {
    const res = await fetch('https://api.awsli.com.br/webhooks/v1/cliente', {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notifyUrl, token: webhookToken }),
    });
    if (res.ok) {
      registered.push('cliente');
      log.info('[LI-SYNC] Webhook registered for cliente');
    } else {
      const errText = await res.text();
      errors.push(`cliente: ${res.status} ${errText}`);
      log.error(`[LI-SYNC] Failed to register cliente webhook: ${res.status}`, errText);
    }
  } catch (e: unknown) {
    errors.push(`cliente: ${e.message}`);
  }

  if (registered.length === 0) {
    return { success: false, message: `Falha ao registrar webhooks: ${errors.join('; ')}` };
  }

  // Save webhook token to integration metadata
  const { data: currentInt } = await supabase.from('integrations')
    .select('metadata').eq('id', integrationId).single();
  
  const currentMetadata = (currentInt?.metadata && typeof currentInt.metadata === 'object') 
    ? currentInt.metadata 
    : {};

  await supabase.from('integrations').update({
    metadata: {
      ...currentMetadata,
      webhook_token: webhookToken,
      webhooks_registered: registered,
      webhooks_registered_at: new Date().toISOString(),
    },
  }).eq('id', integrationId);

  const message = errors.length > 0
    ? `Webhooks registrados: ${registered.join(', ')}. Erros: ${errors.join('; ')}`
    : `Webhooks registrados com sucesso: ${registered.join(', ')}`;

  return { success: true, message, webhooks_registered: registered };
}
