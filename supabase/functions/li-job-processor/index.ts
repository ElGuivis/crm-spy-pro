import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { syncNewCustomers, updateExistingCustomers } from "../_shared/li-sync-customers.ts";
import { updateProductInfo, syncNewProducts } from "../_shared/li-sync-products.ts";
import { syncNewOrders, processOrder, updateOrderStatuses } from "../_shared/li-sync-orders.ts";
import { syncAbandonedCarts, updateExistingCarts, syncCoupons, processOrderNotificationsInJob } from "../_shared/li-sync-carts.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const LI_API_BASE = 'https://api.awsli.com.br/v1';

type Logger = ReturnType<typeof createLogger>;

async function runJobProcessor(
  supabase: ServiceClient,
  appKey: string,
  requestBody: Record<string, unknown>,
  log: Logger,
): Promise<void> {
  const results: Record<string, unknown>[] = [];

    // 1. Resume stuck jobs first
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: stuckJobs, error } = await supabase
      .from('li_sync_jobs')
      .select('*, li_sync_logs!inner(status)')
      .or(`status.eq.pending,and(status.eq.running,started_at.lt.${fiveMinutesAgo})`)
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(5);

    if (!error && stuckJobs && stuckJobs.length > 0) {
      const activeJobs = stuckJobs.filter((j: Record<string, unknown>) => 
        j.li_sync_logs?.status !== 'cancelled' && j.li_sync_logs?.status !== 'completed'
      );

      if (activeJobs.length > 0) {
        log.info(`Found ${activeJobs.length} stuck jobs to resume`);

        for (const job of activeJobs) {
          try {
            const { data, error } = await supabase.functions.invoke('li-sync', {
              body: { resumeJobId: job.id }
            });

            results.push({
              type: 'resume_job',
              jobId: job.id,
              success: !error,
              message: error?.message || 'Resumed'
            });
          } catch (e) {
            results.push({
              type: 'resume_job',
              jobId: job.id,
              success: false,
              message: e instanceof Error ? e.message : 'Unknown error'
            });
          }
        }
      }
    }

    // 2. Incremental sync - fetch new data since last sync
    // Support filtering by integrationId and syncType for individual syncs
    const specifiedIntegrationId = requestBody.integrationId || null;
    const specifiedSyncType = requestBody.syncType || null;
    const isManualRequest = !!requestBody.manual || !!specifiedSyncType;
    
    // Select individual sync fields for each type
    let integrationQuery = supabase
      .from('integrations')
      .select(`
        id, api_key, last_sync_at, tenant_id,
        auto_sync_orders, auto_sync_orders_interval, last_sync_orders_at,
        auto_sync_customers, auto_sync_customers_interval, last_sync_customers_at,
        auto_sync_products, auto_sync_products_interval, last_sync_products_at,
        auto_sync_carts, auto_sync_carts_interval, last_sync_carts_at,
        auto_sync_coupons, auto_sync_coupons_interval, last_sync_coupons_at
      `)
      .eq('type', 'loja_integrada')
      .eq('status', 'connected');
    
    if (specifiedIntegrationId) {
      integrationQuery = integrationQuery.eq('id', specifiedIntegrationId);
    } else {
      // For cron runs, get integrations that have at least one sync type enabled
      integrationQuery = integrationQuery.or('auto_sync_orders.eq.true,auto_sync_customers.eq.true,auto_sync_products.eq.true,auto_sync_carts.eq.true,auto_sync_coupons.eq.true');
    }
    
    const { data: integrations } = await integrationQuery.limit(specifiedIntegrationId ? 1 : 10);

    // Helper function to check if a sync type should run based on its individual interval
    const shouldSyncType = (integration: Record<string, unknown>, type: string, isManual: boolean): boolean => {
      const enabledField = `auto_sync_${type}`;
      const intervalField = `auto_sync_${type}_interval`;
      const lastSyncField = `last_sync_${type}_at`;
      
      const isEnabled = integration[enabledField] === true;
      
      if (isManual) {
        // For manual requests, always sync the specified type
        return true;
      }
      
      if (!isEnabled) {
        return false;
      }
      
      // Check if enough time has passed since last sync for this type
      const lastSync = integration[lastSyncField] ? new Date(integration[lastSyncField]).getTime() : 0;
      const intervalMs = (integration[intervalField] || 5) * 60 * 1000;
      const now = Date.now();
      
      return now - lastSync >= intervalMs;
    };

    for (const integration of (integrations || [])) {
      if (!integration?.api_key) continue;
      
      const intId = integration.id;
      const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;
      const tenantId = integration.tenant_id;
      
      log.info(`[JOB-PROCESSOR] Processing integration ${intId}, syncType: ${specifiedSyncType || 'all'}, manual: ${isManualRequest}`);
      
      const updateData: Record<string, unknown> = {};
      
      // Sync orders if not filtered or filtered to orders
      const shouldSyncOrders = (!specifiedSyncType || specifiedSyncType === 'orders') && 
        shouldSyncType(integration, 'orders', isManualRequest);
      
      if (shouldSyncOrders) {
        const { data: lastOrder } = await supabase
          .from('li_orders')
          .select('loja_integrada_order_id, order_number, created_at_remote')
          .eq('integration_id', intId)
          .order('created_at_remote', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const lastDataCriacao = lastOrder?.created_at_remote || null;
        const lastLiId = lastOrder?.loja_integrada_order_id || 0;
        log.info(`[INCREMENTAL] Starting orders sync. Last order in DB: #${lastOrder?.order_number || 'none'} (li_id: ${lastLiId})`);

        const ordersResult = await syncNewOrders(supabase, authHeader, lastDataCriacao, lastLiId, supabaseUrl, supabaseKey, tenantId, intId);
        results.push({ type: 'incremental_orders', integrationId: intId, ...ordersResult });
        
        // Also update status of existing orders (check last 50 orders for status changes)
        const statusResult = await updateOrderStatuses(supabase, authHeader, tenantId, intId);
        if (statusResult.updated > 0) {
          results.push({ type: 'order_status_update', integrationId: intId, ...statusResult });
        }
        
        updateData.last_sync_orders_at = new Date().toISOString();
      }

      // Sync customers if not filtered or filtered to customers
      const shouldSyncCustomers = (!specifiedSyncType || specifiedSyncType === 'customers') && 
        shouldSyncType(integration, 'customers', isManualRequest);
      
      if (shouldSyncCustomers) {
        const customersResult = await syncNewCustomers(supabase, authHeader, tenantId, intId);
        results.push({ type: 'incremental_customers', integrationId: intId, ...customersResult });
        
        // Update existing customers with all latest data
        const updateCustomersResult = await updateExistingCustomers(supabase, authHeader, tenantId, intId);
        if (updateCustomersResult.updated > 0) {
          results.push({ type: 'customer_info_update', integrationId: intId, ...updateCustomersResult });
        }
        
        updateData.last_sync_customers_at = new Date().toISOString();
      }

      // Sync products if not filtered or filtered to products
      const shouldSyncProducts = (!specifiedSyncType || specifiedSyncType === 'products') && 
        shouldSyncType(integration, 'products', isManualRequest);
      
      if (shouldSyncProducts) {
        // Check if this is an updateOnly request (just update stock/info, not fetch new products)
        const isUpdateOnly = requestBody.updateOnly === true;
        
        if (!isUpdateOnly) {
          const productsResult = await syncNewProducts(supabase, authHeader, tenantId, intId);
          results.push({ type: 'incremental_products', integrationId: intId, ...productsResult });
        }
        
        // Always update existing products' stock/info when syncing products
        const updateResult = await updateProductInfo(supabase, authHeader, tenantId, intId);
        results.push({ type: 'product_info_update', integrationId: intId, ...updateResult });
        
        updateData.last_sync_products_at = new Date().toISOString();
      }

      // Sync abandoned carts if filtered to carts
      const shouldSyncCarts = (!specifiedSyncType || specifiedSyncType === 'carts') && 
        shouldSyncType(integration, 'carts', isManualRequest);
      
      if (shouldSyncCarts) {
        const cartsResult = await syncAbandonedCarts(supabase, authHeader, tenantId, intId);
        results.push({ type: 'incremental_carts', integrationId: intId, ...cartsResult });
        
        // Update existing carts - check for recovery and update data
        const updateCartsResult = await updateExistingCarts(supabase, authHeader, tenantId, intId);
        if (updateCartsResult.updated > 0 || updateCartsResult.recovered > 0) {
          results.push({ type: 'cart_update', integrationId: intId, ...updateCartsResult });
        }
        
        updateData.last_sync_carts_at = new Date().toISOString();
      }

      // Sync coupons if filtered to coupons
      const shouldSyncCoupons = (!specifiedSyncType || specifiedSyncType === 'coupons') && 
        shouldSyncType(integration, 'coupons', isManualRequest);
      
      if (shouldSyncCoupons) {
        const couponsResult = await syncCoupons(supabase, authHeader, tenantId, intId);
        results.push({ type: 'incremental_coupons', integrationId: intId, ...couponsResult });
        updateData.last_sync_coupons_at = new Date().toISOString();
      }

      // Update timestamps for synced types - always update last_sync_at on every check
      updateData.last_sync_at = new Date().toISOString();
      
      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('integrations')
          .update(updateData)
          .eq('id', intId);
      }
    }

  const totalSynced = results.reduce((sum, r) => sum + (Number(r.synced) || 0), 0);
  log.info(`[JOB-PROCESSOR] Done. Processed ${results.length} tasks, synced ${totalSynced} records`);
}

// Called by cron 4 every 5 minutes. Heavy work (LI API reconciliation across
// orders/customers/products/carts/coupons) runs in EdgeRuntime.waitUntil so the
// pg_net cron call gets an immediate 200 — keeping cron healthy regardless of
// how long the underlying sync takes.
Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("li-job-processor", cid);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

    let requestBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText) requestBody = JSON.parse(bodyText);
    } catch { /* ignore */ }

    log.info('[JOB-PROCESSOR] ✅ Authenticated; dispatching to background');

    const supabase = createClient(supabaseUrl, supabaseKey);

    EdgeRuntime.waitUntil(
      runJobProcessor(supabase, appKey, requestBody, log).catch((err: unknown) => {
        log.error('[JOB-PROCESSOR] Background error:', err instanceof Error ? err.message : err);
      })
    );

    return new Response(JSON.stringify({
      success: true,
      message: 'Job processor dispatched',
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    log.error('Job processor dispatch error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
