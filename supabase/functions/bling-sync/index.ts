/**
 * Bling Sync Edge Function
 * Orchestrates sync of orders, customers, and products from Bling ERP.
 *
 * Domain logic extracted to _shared/bling-sync-{orders,customers,products}.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { type BlingConnection } from "../_shared/bling-sync-helpers.ts";
import { syncOrders } from "../_shared/bling-sync-orders.ts";
import { syncCustomersFromOrders } from "../_shared/bling-sync-customers.ts";
import { syncProducts } from "../_shared/bling-sync-products.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { parseChannelScope } from "../_shared/bling-channels.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

/** Tempo de pedidos por chamada (o runtime encerra a chamada perto de 150 s). */
const ORDERS_BUDGET_MS = 100_000;

async function priorSaved(supabase: ReturnType<typeof createClient>, jobId: string): Promise<number> {
  const { data } = await supabase.from('bling_sync_jobs').select('saved_count').eq('id', jobId).maybeSingle();
  return Number((data as { saved_count?: number } | null)?.saved_count) || 0;
}

/** Grava onde parou e chama o bling-sync de novo para continuar (carga de pedidos grande). */
async function continueOrders(
  supabase: ReturnType<typeof createClient>, integrationId: string, syncLogId: string, jobId: string,
  next: { query: number; page: number }, syncedNow: number, jobIds: string[],
): Promise<string> {
  const saved = (await priorSaved(supabase, jobId)) + syncedNow;
  const now = new Date().toISOString();
  await supabase.from('bling_sync_jobs').update({ status: 'running', resume_page: next.page, saved_count: saved, updated_at: now }).eq('id', jobId);
  // mantém vivos os outros jobs desta carga (o bling-sync marca como travado o que passa de 5 min parado)
  await supabase.from('bling_sync_jobs').update({ updated_at: now }).in('id', jobIds).eq('status', 'pending');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bling-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ integrationId, syncType: 'orders', resumeJobId: jobId, resumeLogId: syncLogId, resumeQuery: next.query, resumePage: next.page }),
  });
  await res.body?.cancel();
  return `[bling-sync] orders: ${saved} salvos, continua na página ${next.page} (HTTP ${res.status})`;
}

async function ensureValidToken(supabase: ServiceClient, connection: BlingConnection): Promise<string> {
  return ensureBlingToken(supabase, connection, '[bling-sync]');
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("bling-sync", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    // os canais vêm SEMPRE da integração salva (o corpo não manda mais neles)
    const { integrationId, syncType = 'all', incremental = false } = body;
    // continuação de uma carga de pedidos que passou do tempo de uma chamada (só interna)
    const resume = auth.isInternal && typeof body.resumeJobId === 'string'
      ? { jobId: body.resumeJobId as string, query: Number(body.resumeQuery) || 0, page: Number(body.resumePage) || 1 }
      : null;

    log.info(`[bling-sync] Starting sync: integration=${integrationId}, type=${syncType}, incremental=${incremental}`);

    if (!integrationId) {
      return new Response(
        JSON.stringify({ error: 'integrationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // IDOR protection: validate integration belongs to user's tenant on user calls
    if (!auth.isInternal && auth.tenantId) {
      await requireResource(supabase, "integrations", integrationId, auth.tenantId, req);
    }

    // Auto-recover stuck jobs (running/pending for more than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let stuckQuery = supabase
      .from('bling_sync_jobs')
      .select('id, sync_log_id')
      .eq('integration_id', integrationId)
      .in('status', ['running', 'pending'])
      .lt('updated_at', fiveMinutesAgo);
    if (resume) stuckQuery = stuckQuery.neq('sync_log_id', body.resumeLogId);
    const { data: stuckJobs } = await stuckQuery;

    if (stuckJobs && stuckJobs.length > 0) {
      log.info(`[bling-sync] Found ${stuckJobs.length} stuck jobs (>5min), marking as failed`);

      for (const job of stuckJobs) {
        await supabase
          .from('bling_sync_jobs')
          .update({
            status: 'failed',
            error_message: 'Timeout - job stuck for more than 5 minutes',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);

        if (job.sync_log_id) {
          await supabase
            .from('bling_sync_logs')
            .update({
              status: 'failed',
              error_message: 'Timeout - job stuck for more than 5 minutes',
              completed_at: new Date().toISOString()
            })
            .eq('id', job.sync_log_id);
        }
      }
    }

    // Get integration details
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('tenant_id, type, bling_store_ids, bling_product_store_id')
      .eq('id', integrationId)
      .single();

    if (intError || !integration) {
      log.error('[bling-sync] Integration not found:', intError);
      return new Response(
        JSON.stringify({ error: 'Integration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Bling connection
    const { data: connection, error: connError } = await supabase
      .from('bling_connections')
      .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, bling_company_id')
      .eq('tenant_id', integration.tenant_id)
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      log.error('[bling-sync] Bling connection not found:', connError);
      return new Response(
        JSON.stringify({ error: 'Bling connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await ensureValidToken(supabase, connection);
    const scope = parseChannelScope(integration);

    let syncLog: { id: string };
    const jobs: Array<{ id: string; job_type: 'orders' | 'customers' | 'products' }> = [];
    if (resume) {
      syncLog = { id: body.resumeLogId as string };
      const { data: rest } = await supabase.from('bling_sync_jobs').select('id, job_type')
        .eq('sync_log_id', syncLog.id).eq('status', 'pending').eq('job_type', 'customers').order('created_at');
      jobs.push({ id: resume.jobId, job_type: 'orders' }, ...((rest ?? []) as typeof jobs));
    } else {
      // Create sync log
      const { data: createdLog, error: logError } = await supabase
        .from('bling_sync_logs')
        .insert({
          integration_id: integrationId,
          tenant_id: integration.tenant_id,
          sync_type: syncType,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (logError) {
        log.error('[bling-sync] Error creating sync log:', logError);
        throw logError;
      }
      syncLog = createdLog;

      // Determine which sync types to run
      const syncTypes: Array<'orders' | 'customers' | 'products'> = syncType === 'all'
        ? ['orders', 'customers', 'products']
        : [syncType];

      // Create jobs
      for (const type of syncTypes) {
        const { data: job, error: jobError } = await supabase
          .from('bling_sync_jobs')
          .insert({
            sync_log_id: syncLog.id,
            integration_id: integrationId,
            tenant_id: integration.tenant_id,
            job_type: type,
            status: 'pending',
            started_at: new Date().toISOString(),
          })
          .select('id, job_type')
          .single();

        if (jobError || !job) {
          log.error(`[bling-sync] Error creating job for ${type}:`, jobError);
          continue;
        }
        jobs.push(job);
      }
    }

    // Run sync in background
    const startedAt = Date.now();
    const backgroundTask = async () => {
      let totalRecords = 0;
      let hadError = false;

      for (const job of jobs) {
        const type = job.job_type;

        await supabase
          .from('bling_sync_jobs')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', job.id);

        try {
          let synced = 0;

          switch (type) {
            case 'orders': {
              const r = await syncOrders(supabase, accessToken, integrationId, integration.tenant_id, job.id, scope.orderStoreIds, incremental,
                { query: resume?.query, page: resume?.page, deadline: startedAt + ORDERS_BUDGET_MS });
              if (r.next) {
                log.info(await continueOrders(supabase, integrationId, syncLog.id, job.id, r.next, r.synced, jobs.map((j) => j.id)));
                return; // a próxima chamada termina os pedidos e faz o resto
              }
              synced = r.synced + (resume ? await priorSaved(supabase, job.id) : 0);
              await supabase.from('integrations').update({
                last_orders_sync_at: new Date().toISOString(),
                last_sync_at: new Date().toISOString(),
                initial_sync_completed: true,
              }).eq('id', integrationId);
              break;
            }

            case 'customers':
              synced = await syncCustomersFromOrders(supabase, accessToken, integrationId, integration.tenant_id, job.id);
              await supabase.from('integrations').update({
                last_customers_sync_at: new Date().toISOString(),
                last_sync_at: new Date().toISOString(),
                initial_sync_completed: true,
              }).eq('id', integrationId);
              break;

            case 'products':
              synced = await syncProducts(supabase, accessToken, integrationId, integration.tenant_id, job.id, scope.productStoreId);
              break;
          }

          totalRecords += synced;

          if (type !== 'products') {
            await supabase
              .from('bling_sync_jobs')
              .update({
                status: 'completed',
                saved_count: synced,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);
          }

          log.info(`[bling-sync] ${type} sync completed: ${synced} records`);
        } catch (err: unknown) {
          hadError = true;
          log.error(`[bling-sync] Error syncing ${type}:`, err);

          await supabase
            .from('bling_sync_jobs')
            .update({
              status: 'failed',
              error_message: (err as Error)?.message ?? 'Unknown error',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        }
      }

      // Check if products are still processing
      const { data: pendingProductJobs } = await supabase
        .from('bling_sync_jobs')
        .select('id')
        .eq('sync_log_id', syncLog.id)
        .eq('job_type', 'products')
        .in('status', ['pending', 'running'])
        .limit(1);

      const hasProductsStillProcessing = pendingProductJobs && pendingProductJobs.length > 0;

      if (!hasProductsStillProcessing) {
        await supabase.from('bling_sync_logs').update({
          status: hadError ? 'failed' : 'completed',
          records_synced: totalRecords,
          completed_at: new Date().toISOString(),
          error_message: hadError ? 'One or more sync jobs failed' : null,
        }).eq('id', syncLog.id);
      } else {
        await supabase.from('bling_sync_logs').update({ records_synced: totalRecords }).eq('id', syncLog.id);
        log.info('[bling-sync] Products sync still in progress, keeping sync log as running');
      }

      log.info(`[bling-sync] Sync finished: status=${hadError ? 'failed' : 'completed'}, records=${totalRecords}`);
    };

    EdgeRuntime.waitUntil(backgroundTask());

    return new Response(
      JSON.stringify({ success: true, syncLogId: syncLog.id, message: 'Sync started in background' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error('[bling-sync] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
