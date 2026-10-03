import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureValidToken } from "./job-helpers.ts";
import { syncNewProducts } from "./product-sync.ts";
import { updateProductStock } from "./stock-sync.ts";
import { syncCustomersFromOrders } from "./customer-sync.ts";
import { syncNewOrders } from "./order-sync.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("bling-job-processor", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let requestBody: Record<string, unknown> = {};
    try { const bodyText = await req.text(); if (bodyText) requestBody = JSON.parse(bodyText); } catch { /* ignore */ }

    log.info(`[BLING-JOB] Auth successful (isInternal=${auth.isInternal}), processing...`);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Record<string, unknown>[] = [];

    const specifiedIntegrationId = requestBody.integrationId as string || null;
    const specifiedSyncType = requestBody.syncType as string || null;
    const isManualRequest = !!specifiedIntegrationId || !!specifiedSyncType;

    // Chamada de usuário: só opera sobre uma integração do próprio tenant (o modo global é só do cron).
    if (!auth.isInternal) {
      if (!specifiedIntegrationId) {
        return new Response(JSON.stringify({ success: false, error: 'integrationId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await requireResource(supabase, "integrations", specifiedIntegrationId, auth.tenantId!, req);
    }

    const { data: connectedConnections } = await supabase.from('bling_connections').select('tenant_id').eq('status', 'connected');
    const connectedTenantIds = (connectedConnections || []).map(c => c.tenant_id);

    let integrationQuery = supabase.from('integrations').select(`id, tenant_id, bling_store_ids, auto_sync_orders, auto_sync_orders_interval, last_sync_orders_at, auto_sync_products, auto_sync_products_interval, last_sync_products_at, auto_sync_customers, auto_sync_customers_interval, last_sync_customers_at, initial_sync_completed`).eq('type', 'bling');
    if (specifiedIntegrationId) {
      integrationQuery = integrationQuery.eq('id', specifiedIntegrationId);
      if (!auth.isInternal) integrationQuery = integrationQuery.eq('tenant_id', auth.tenantId!);
    } else {
      integrationQuery = integrationQuery.eq('initial_sync_completed', true).or('auto_sync_orders.eq.true,auto_sync_products.eq.true,auto_sync_customers.eq.true').in('tenant_id', connectedTenantIds.length > 0 ? connectedTenantIds : ['none']);
    }
    const { data: integrations } = await integrationQuery.limit(10);

    for (const integration of (integrations || [])) {
      const intId = integration.id;
      const tenantId = integration.tenant_id;

      if (!isManualRequest) {
        const lastSync = integration.last_sync_orders_at ? new Date(integration.last_sync_orders_at).getTime() : 0;
        const intervalMs = (integration.auto_sync_orders_interval || 5) * 60 * 1000;
        if (Date.now() - lastSync < intervalMs) { log.info(`[BLING-JOB] Skipping ${intId}, interval not reached`); continue; }
      }

      const { data: connection } = await supabase.from('bling_connections').select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, bling_company_id').eq('tenant_id', tenantId).eq('status', 'connected').order('created_at', { ascending: false }).limit(1).single();
      if (!connection) { log.info(`[BLING-JOB] No connection found for integration ${intId}`); continue; }

      try {
        const accessToken = await ensureValidToken(supabase, connection);

        const shouldSyncOrders = specifiedSyncType === 'orders' || (!specifiedSyncType && integration.auto_sync_orders);
        if (shouldSyncOrders) {
          const lastOrderSync = integration.last_sync_orders_at ? new Date(integration.last_sync_orders_at).getTime() : 0;
          const orderIntervalReached = isManualRequest || (Date.now() - lastOrderSync >= (integration.auto_sync_orders_interval || 5) * 60 * 1000);
          if (orderIntervalReached) {
            const { data: lastOrder } = await supabase.from('bling_orders').select('bling_id').eq('integration_id', intId).order('bling_id', { ascending: false }).limit(1).maybeSingle();
            const lastOrderBlingId = lastOrder?.bling_id || 0;
            log.info(`[BLING-JOB] Processing orders for ${intId}, last bling_id: ${lastOrderBlingId}`);
            const ordersResult = await syncNewOrders(supabase, accessToken, intId, tenantId, integration.bling_store_ids || null, lastOrderBlingId, log);
            results.push({ type: 'incremental_orders', integrationId: intId, ...ordersResult });
            await supabase.from('integrations').update({ last_sync_orders_at: new Date().toISOString(), last_sync_at: new Date().toISOString() }).eq('id', intId);
          }
        }

        const lastProductSync = integration.last_sync_products_at ? new Date(integration.last_sync_products_at).getTime() : 0;
        const productIntervalReached = isManualRequest || (Date.now() - lastProductSync >= (integration.auto_sync_products_interval || 15) * 60 * 1000);
        const shouldSyncProducts = specifiedSyncType === 'products' || (!specifiedSyncType && integration.auto_sync_products);

        if (shouldSyncProducts && productIntervalReached) {
          const { data: lastProduct } = await supabase.from('bling_products').select('bling_id').eq('integration_id', intId).order('bling_id', { ascending: false }).limit(1).maybeSingle();
          const lastProductBlingId = lastProduct?.bling_id || 0;
          log.info(`[BLING-JOB] Processing new products for ${intId}, last bling_id: ${lastProductBlingId}`);
          const productsResult = await syncNewProducts(supabase, accessToken, intId, tenantId, lastProductBlingId, log);
          results.push({ type: 'incremental_products', integrationId: intId, ...productsResult });
          await supabase.from('integrations').update({ last_sync_products_at: new Date().toISOString(), last_sync_at: new Date().toISOString() }).eq('id', intId);
        }

        const shouldUpdateStock = specifiedSyncType === 'products_stock' || (shouldSyncProducts && productIntervalReached);
        if (shouldUpdateStock) {
          log.info(`[BLING-JOB] Updating product stock for ${intId}`);
          const stockResult = await updateProductStock(supabase, accessToken, intId, tenantId, log);
          results.push({ type: 'stock_update', integrationId: intId, ...stockResult });
        }

        const shouldSyncCustomers = specifiedSyncType === 'customers' || (!specifiedSyncType && integration.auto_sync_customers);
        if (shouldSyncCustomers) {
          const lastCustomerSync = integration.last_sync_customers_at ? new Date(integration.last_sync_customers_at).getTime() : 0;
          const customerIntervalReached = isManualRequest || (Date.now() - lastCustomerSync >= (integration.auto_sync_customers_interval || 15) * 60 * 1000);
          if (customerIntervalReached) {
            log.info(`[BLING-JOB] Syncing customers from orders for ${intId}`);
            const customersResult = await syncCustomersFromOrders(supabase, accessToken, intId, tenantId, log);
            results.push({ type: 'incremental_customers', integrationId: intId, ...customersResult });
            await supabase.from('integrations').update({ last_sync_customers_at: new Date().toISOString(), last_sync_at: new Date().toISOString() }).eq('id', intId);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        log.error(`[BLING-JOB] Error processing ${intId}:`, msg);
        results.push({ type: 'error', integrationId: intId, error: msg });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + ((r.synced as number) || 0), 0);
    return new Response(JSON.stringify({ success: true, message: `Processed ${results.length} tasks, synced ${totalSynced} records`, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
