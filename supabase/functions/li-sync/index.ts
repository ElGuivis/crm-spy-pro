import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { SYNC_TIME_BUDGET_MS, getOrCreateSyncState, updateSyncState } from "./fetch-helpers.ts";
import { syncAllCustomers } from "./sync-customers.ts";
import { syncAllProducts } from "./sync-products.ts";
import { syncAllOrders } from "./sync-orders.ts";
import { registerWebhooks } from "./sync-webhooks.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const log = createLogger("li-sync", "bg");

async function runFullSync(
  supabase: ServiceClient, integrationId: string, tenantId: string,
  authHeader: string, syncType: string, _syncId: string
) {
  log.info(`[LI-SYNC] runFullSync started for ${syncType} at ${new Date().toISOString()}`);
  const types = syncType === 'all' ? ['customers', 'products', 'orders'] : [syncType];
  const deadline = Date.now() + SYNC_TIME_BUDGET_MS;
  const totalSynced: Record<string, number> = {};

  for (const type of types) {
    totalSynced[type] = 0;
    log.info(`[LI-SYNC] ${type}: starting sync loop...`);
    let typeDone = false;
    while (!typeDone && Date.now() < deadline) {
      let batchSynced = 0;
      try {
        if (type === 'customers') batchSynced = await syncAllCustomers(supabase, integrationId, tenantId, authHeader, deadline);
        else if (type === 'products') batchSynced = await syncAllProducts(supabase, integrationId, tenantId, authHeader, deadline);
        else if (type === 'orders') batchSynced = await syncAllOrders(supabase, integrationId, tenantId, authHeader, deadline);
        totalSynced[type] += batchSynced;
      } catch (e: unknown) { log.error(`[LI-SYNC] ${type} batch failed:`, (e as Error).message); break; }
      const { data: st } = await supabase.from('li_sync_state').select('last_offset').eq('integration_id', integrationId).eq('entity_type', type).maybeSingle();
      typeDone = (st?.last_offset ?? 0) === 0;
      if (!typeDone) log.info(`[LI-SYNC] ${type}: batch done (${batchSynced} items), more data pending...`);
    }
    const state = await getOrCreateSyncState(supabase, integrationId, tenantId, type);
    if (state?.id) await updateSyncState(supabase, state.id, { last_synced_at: new Date().toISOString(), records_synced: totalSynced[type] });
    log.info(`[LI-SYNC] ${type}: complete — ${totalSynced[type]} total, done=${typeDone}`);
  }

  log.info('[LI-SYNC] All sync loops finished:', totalSynced);

  const checkTypes = syncType === 'all' ? ['customers', 'products', 'orders'] : [syncType];
  const pendingStates = await Promise.all(checkTypes.map(async t => {
    const { data } = await supabase.from('li_sync_state').select('last_offset').eq('integration_id', integrationId).eq('entity_type', t).maybeSingle();
    return { type: t, offset: data?.last_offset ?? 0 };
  }));
  const pendingTypes = pendingStates.filter(s => s.offset > 0).map(s => s.type);

  if (pendingTypes.length > 0) {
    log.warn(`[LI-SYNC] Time budget exhausted — still pending: ${pendingTypes.join(', ')}. Triggering continuation...`);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    for (const t of pendingTypes) {
      fetch(`${supabaseUrl}/functions/v1/li-sync`, { method: 'POST', headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ integrationId, syncType: t }) }).catch(() => {});
    }
    return;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  try {
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;
    const { data: intData } = await supabase.from('integrations').select('api_key, metadata').eq('id', integrationId).single();
    if (intData?.api_key) {
      const authH = `chave_api ${intData.api_key} aplicacao ${appKey}`;
      const existingMeta = (intData.metadata && typeof intData.metadata === 'object') ? intData.metadata as Record<string, unknown> : {};
      if (!existingMeta.webhooks_registered_at) {
        log.info('[LI-SYNC] All data synced — registering LI webhooks for real-time updates...');
        await registerWebhooks(supabase, integrationId, authH, supabaseUrl);
      }
    }
  } catch (webhookErr: unknown) { log.error('[LI-SYNC] Webhook registration failed (non-fatal):', (webhookErr as Error).message); }

  log.info('[LI-SYNC] Full sync complete — real-time webhook mode active');
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const reqLog = createLogger("li-sync", cid);

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
      if (!auth.isInternal && auth.tenantId) await requireResource(supabase, "integrations", integrationId as string, auth.tenantId, req);
      let query = supabase.from('integrations').select('id, api_key, tenant_id, last_sync_at, metadata').eq('id', integrationId);
      if (!auth.isInternal && auth.tenantId) query = query.eq('tenant_id', auth.tenantId);
      const { data } = await query.maybeSingle();
      integration = data;
    } else {
      let query = supabase.from('integrations').select('id, api_key, tenant_id, last_sync_at, metadata').eq('type', 'loja_integrada').eq('status', 'connected').not('tenant_id', 'is', null);
      if (!auth.isInternal && auth.tenantId) query = query.eq('tenant_id', auth.tenantId);
      const { data } = await query.limit(1).maybeSingle();
      integration = data;
    }

    if (!integration?.api_key) throw new Error('No connected Loja Integrada integration found');

    const intId = integration.id;
    const tenantId = integration.tenant_id;
    const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;

    if (action === 'register-webhook') {
      reqLog.info(`[LI-SYNC] Registering webhooks for integration ${intId}`);
      const result = await registerWebhooks(supabase, intId, authHeader, supabaseUrl);
      return new Response(JSON.stringify(result), { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    reqLog.info(`[LI-SYNC] Starting sync - type: ${syncType || 'all'}, integration: ${integrationId}`);
    const syncId = crypto.randomUUID();
    const isFirstSync = !integration.last_sync_at;

    await supabase.from('integrations').update({ last_sync_at: new Date().toISOString(), initial_sync_completed: true, error_message: null }).eq('id', intId);
    EdgeRuntime.waitUntil(runFullSync(supabase, intId, tenantId, authHeader, syncType || 'all', syncId));

    return new Response(JSON.stringify({ success: true, message: 'Sincronização iniciada', syncId, isFirstSync }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const msg = error instanceof Error ? error.message : String(error);
    reqLog.error('[LI-SYNC] Error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
