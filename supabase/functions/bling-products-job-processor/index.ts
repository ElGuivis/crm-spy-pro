import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { acquireLock, releaseLock } from './job-helpers.ts';
import { processProductJob } from './product-job.ts';
import { processEnrichmentJob } from './enrichment-job.ts';

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("bling-products-job-processor", cid);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    await requireUserOrInternalAuth(req);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const results: Record<string, unknown>[] = [];

    let requestBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText) requestBody = JSON.parse(bodyText);
    } catch { /* ignore */ }

    const specificJobId = requestBody.jobId;

    let jobsQuery = supabase
      .from('bling_sync_jobs')
      .select('*, bling_sync_logs!inner(integration_id)')
      .in('job_type', ['products', 'product_enrichment'])
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: true })
      .limit(5);

    if (specificJobId) {
      jobsQuery = supabase
        .from('bling_sync_jobs')
        .select('*, bling_sync_logs!inner(integration_id)')
        .eq('id', specificJobId)
        .in('status', ['pending', 'running'])
        .limit(1);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;

    if (jobsError) { log.error('[PRODUCTS-JOB] Error fetching jobs:', jobsError); throw jobsError; }

    if (!jobs || jobs.length === 0) {
      log.info('[PRODUCTS-JOB] No pending jobs found');
      return new Response(JSON.stringify({ success: true, message: 'No pending jobs', results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[PRODUCTS-JOB] Found ${jobs.length} jobs to process`);

    for (const job of jobs) {
      try {
        const lockAcquired = await acquireLock(supabase, job.id, log);
        if (!lockAcquired) {
          log.info(`[PRODUCTS-JOB] Could not acquire lock for job ${job.id}, skipping`);
          results.push({ jobId: job.id, skipped: true, reason: 'locked' });
          continue;
        }

        const { data: connection, error: connError } = await supabase
          .from('bling_connections')
          .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status')
          .eq('tenant_id', job.tenant_id).eq('status', 'connected')
          .order('created_at', { ascending: false }).limit(1).single();

        if (connError || !connection) {
          log.info(`[PRODUCTS-JOB] No connection for job ${job.id}`);
          await releaseLock(supabase, job.id);
          results.push({ jobId: job.id, error: 'No Bling connection' });
          continue;
        }

        const result = job.job_type === 'product_enrichment'
          ? await processEnrichmentJob(supabase, job, connection, log)
          : await processProductJob(supabase, job, connection, log);

        results.push({ jobId: job.id, jobType: job.job_type, ...result });
        await releaseLock(supabase, job.id);

      } catch (err: unknown) {
        log.error(`[PRODUCTS-JOB] Error with job ${job.id}:`, err);
        await releaseLock(supabase, job.id);
        results.push({ jobId: job.id, error: (err as Error).message });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + ((r.synced as number) || 0), 0);
    const completedJobs = results.filter(r => r.completed).length;

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.length} jobs, synced ${totalSynced} products, ${completedJobs} completed`,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[PRODUCTS-JOB] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
