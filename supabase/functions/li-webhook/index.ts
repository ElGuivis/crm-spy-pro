import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("li-webhook", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rawBody = await req.text();

  // Parse payload first
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate webhook token - prioritize payload token (LI sends it in body)
  // Header Authorization may contain Supabase JWT, so payload.token is more reliable
  const payloadToken = payload.token || null;
  
  // Only use Bearer from header if it's short (not a JWT) and payload token is missing
  const authHeaderValue = req.headers.get('authorization') || '';
  const bearerMatch = authHeaderValue.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1] : null;
  const isJWT = bearerToken && bearerToken.length > 100;
  
  const tokenToValidate = payloadToken || (isJWT ? null : bearerToken);

  if (!tokenToValidate) {
    log.error('[WEBHOOK] No token found in Authorization header or payload');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Look up integration by webhook_token in metadata
  // Fetch all connected LI integrations and match by webhook_token in metadata
  const { data: integrations, error: lookupError } = await supabase
    .from('integrations')
    .select('id, api_key, tenant_id, metadata')
    .eq('type', 'loja_integrada')
    .eq('status', 'connected');

  const integration = (integrations || []).find((i: Record<string, unknown>) => {
    const meta = i.metadata;
    return meta && typeof meta === 'object' && (meta as Record<string, unknown>).webhook_token === tokenToValidate;
  });

  if (lookupError || !integration) {
    log.error('[WEBHOOK] Invalid token - no matching integration found', { tokenToValidate, count: integrations?.length });
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const integrationId = integration.id;
  const tenantId = integration.tenant_id;
  const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;

  // Determine event type from LI payload format
  let eventType = 'unknown';
  let resourceType = 'unknown';
  let resourceId = String(payload.id || '');

  const tipo = (payload.tipo || '').toLowerCase();
  if (tipo.includes('pedido') || payload.numero !== undefined) {
    eventType = 'order';
    resourceType = 'order';
    resourceId = String(payload.numero || payload.id || '');
  } else if (tipo.includes('produto')) {
    eventType = 'product';
    resourceType = 'product';
  } else if (tipo.includes('cliente')) {
    eventType = 'customer';
    resourceType = 'customer';
  }

  // Generate stable dedupe key
  const dedupeKey = `${eventType}:${resourceType}:${resourceId}:${Date.now()}`;

  // Rate limiting: check recent events count (100/min per integration)
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count } = await supabase.from('li_webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('integration_id', integrationId)
    .gte('received_at', oneMinuteAgo);

  if ((count || 0) >= 100) {
    log.warn('[WEBHOOK] Rate limit exceeded');
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Persist raw event (idempotent via dedupe_key)
  const { data: eventData, error: insertError } = await supabase.from('li_webhook_events')
    .upsert({
      integration_id: integrationId,
      tenant_id: tenantId,
      event_type: eventType,
      resource_type: resourceType,
      resource_id: resourceId,
      payload_json: payload,
      status: 'received',
      dedupe_key: dedupeKey,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id, status')
    .maybeSingle();

  if (insertError) {
    log.error('[WEBHOOK] Failed to persist event:', insertError.message);
  }

  // If event already existed (processed/processing), skip
  if (eventData && eventData.status !== 'received') {
    return new Response(JSON.stringify({ success: true, deduplicated: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventId = eventData?.id;

  // Respond 200 immediately, process async
  const response = new Response(JSON.stringify({ success: true, eventId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  if (eventId) {
    EdgeRuntime.waitUntil(processEventAsync(supabase, eventId, integrationId, tenantId, authHeader, resourceType, resourceId, supabaseUrl, supabaseKey));
  }

  return response;
});

async function processEventAsync(
  supabase: ServiceClient, eventId: string, integrationId: string, tenantId: string,
  authHeader: string, resourceType: string, resourceId: string,
  supabaseUrl: string, supabaseKey: string
) {
  try {
    await supabase.from('li_webhook_events')
      .update({ status: 'processing' }).eq('id', eventId);

    if (resourceType === 'order') {
      await processOrder(supabase, authHeader, resourceId, integrationId, tenantId, supabaseUrl, supabaseKey);
    } else if (resourceType === 'product') {
      await processProduct(supabase, authHeader, resourceId, integrationId, tenantId);
    } else if (resourceType === 'customer') {
      await processCustomer(supabase, authHeader, resourceId, integrationId, tenantId);
    }

    await supabase.from('li_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', eventId);

    await supabase.from('integrations')
      .update({ last_sync_at: new Date().toISOString() }).eq('id', integrationId);

    log.info(`[WEBHOOK] Event ${eventId} processed successfully`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[WEBHOOK] Event ${eventId} failed:`, msg);
    await supabase.from('li_webhook_events')
      .update({ status: 'failed', error: msg, retry_count: 1 }).eq('id', eventId);
  }
}

async function processOrder(
  supabase: ServiceClient, authHeader: string, orderId: string,
  integrationId: string, tenantId: string, supabaseUrl: string, supabaseKey: string
) {
  const response = await fetch(`${LI_API_BASE}/pedido/${orderId}`, {
    headers: { 'Authorization': authHeader }
  });
  if (!response.ok) throw new Error(`API error fetching order ${orderId}: ${response.status}`);
  const order = await response.json();

  // Upsert customer if available - handle both URI string and object format
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
      const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteLiId}`, {
        headers: { 'Authorization': authHeader }
      });
      if (clienteRes.ok) {
        const cliente = await clienteRes.json();
        const { data: customerData } = await supabase.from('li_customers')
          .upsert({
            integration_id: integrationId, tenant_id: tenantId,
            loja_integrada_customer_id: cliente.id,
            name: cliente.nome || 'Sem nome',
            email: cliente.email,
            phone: cliente.telefone_celular || cliente.telefone_principal,
            doc: cliente.cpf || cliente.cnpj || null,
            address_json: cliente.endereco_principal || null,
            raw_json: cliente,
            updated_at_remote: cliente.data_modificacao || null,
            updated_at_local: new Date().toISOString(),
          }, { onConflict: 'integration_id,loja_integrada_customer_id' })
          .select('id').single();
        customerId = customerData?.id || null;
      }
    }
  }

  // Extract payment info
  const paymentJson: Record<string, unknown> = {};
  if (order.pagamentos?.length > 0) {
    const pag = order.pagamentos[0];
    paymentJson.method = pag.forma_pagamento?.nome || pag.nome;
    paymentJson.gateway = pag.gateway || null;
    paymentJson.installments = pag.parcelamento?.numero_parcelas || 1;
    paymentJson.transaction_id = pag.transacao_id || null;
    paymentJson.brand = pag.bandeira || null;
  }

  // Extract shipping info
  const shippingJson: Record<string, unknown> = {};
  if (order.envios?.length > 0) {
    const envio = order.envios[0];
    shippingJson.method = envio.forma_envio?.nome || null;
    shippingJson.tracking_code = envio.objeto || null;
    shippingJson.tracking_url = envio.url_rastreio || null;
  }
  if (order.endereco_entrega) {
    shippingJson.address = order.endereco_entrega;
  }

  // Build items snapshot
  const itemsJson = (order.itens || []).map((item: Record<string, unknown>) => {
    const productMatch = typeof item.produto === 'string' ? item.produto.match(/\/produto\/(\d+)/) : null;
    return {
      product_id: productMatch ? parseInt(productMatch[1]) : null,
      sku: item.sku || null,
      name: item.nome || 'Item',
      qty: parseInt(item.quantidade) || 1,
      price: parseFloat(item.preco_venda || item.preco_cheio) || 0,
    };
  });

  // Upsert order
  const { data: orderData } = await supabase.from('li_orders')
    .upsert({
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
      shipping_json: shippingJson,
      payment_json: paymentJson,
      items_json: itemsJson,
      created_at_remote: order.data_criacao || null,
      updated_at_remote: order.data_modificacao || null,
      raw_json: order,
      updated_at_local: new Date().toISOString(),
    }, { onConflict: 'integration_id,loja_integrada_order_id' })
    .select('id').single();

  // Upsert order items
  if (orderData?.id && itemsJson.length > 0) {
    await supabase.from('li_order_items').delete().eq('order_id', orderData.id);
    const items = itemsJson.map((item: Record<string, unknown>) => ({
      order_id: orderData.id,
      tenant_id: tenantId,
      loja_integrada_product_id: item.product_id,
      sku: item.sku, name: item.name, qty: item.qty, price: item.price,
      raw_json: item,
    }));
    await supabase.from('li_order_items').insert(items);
  }

  // Trigger cashback check
  await checkCashback(supabase, order, customerId, tenantId, supabaseUrl, supabaseKey);

  log.info(`[WEBHOOK] Order ${order.numero} upserted`);
}

async function processProduct(
  supabase: ServiceClient, authHeader: string, productId: string,
  integrationId: string, tenantId: string
) {
  const response = await fetch(`${LI_API_BASE}/produto/${productId}`, {
    headers: { 'Authorization': authHeader }
  });
  if (!response.ok) throw new Error(`API error fetching product ${productId}: ${response.status}`);
  const product = await response.json();

  await supabase.from('li_products').upsert({
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

  log.info(`[WEBHOOK] Product ${product.id} upserted`);
}

async function processCustomer(
  supabase: ServiceClient, authHeader: string, customerId: string,
  integrationId: string, tenantId: string
) {
  const response = await fetch(`${LI_API_BASE}/cliente/${customerId}`, {
    headers: { 'Authorization': authHeader }
  });
  if (!response.ok) throw new Error(`API error fetching customer ${customerId}: ${response.status}`);
  const customer = await response.json();

  await supabase.from('li_customers').upsert({
    integration_id: integrationId, tenant_id: tenantId,
    loja_integrada_customer_id: customer.id,
    name: customer.nome || 'Sem nome',
    email: customer.email,
    phone: customer.telefone_celular || customer.telefone_principal,
    doc: customer.cpf || customer.cnpj || null,
    address_json: customer.endereco_principal || null,
    raw_json: customer,
    updated_at_remote: customer.data_modificacao || null,
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_customer_id' });

  log.info(`[WEBHOOK] Customer ${customer.id} upserted`);
}

async function checkCashback(
  supabase: ServiceClient, order: Record<string, unknown>, customerId: string | null,
  tenantId: string, supabaseUrl: string, supabaseKey: string
) {
  const situacaoNome = order.situacao?.nome || '';
  const { data: cashbackConfig } = await supabase.from('cashback_configs')
    .select('trigger_statuses, is_active')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .limit(1).maybeSingle();

  if (!cashbackConfig?.trigger_statuses?.length) return;

  const shouldTrigger = cashbackConfig.trigger_statuses.some(
    (s: string) => situacaoNome.toLowerCase() === s.toLowerCase()
  );
  if (!shouldTrigger || !order.valor_total) return;

  const { data: existingCoupon } = await supabase.from('generated_coupons')
    .select('id').eq('order_id', String(order.numero)).eq('tenant_id', tenantId).maybeSingle();
  if (existingCoupon) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        order_id: order.id,
        order_number: order.numero,
        customer_name: order.cliente?.nome || 'Cliente',
        customer_email: order.cliente?.email || '',
        customer_phone: order.cliente?.telefone_celular || '',
        order_total: parseFloat(order.valor_total),
        tenant_id: tenantId,
      }),
    });
  } catch (e) {
    log.error('[WEBHOOK] Cashback trigger failed:', e);
  }
}

