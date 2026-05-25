import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";

export type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
export const PAGE_SIZE = 100;
export const UPSERT_CHUNK_SIZE = 25;
export const RATE_LIMIT_DELAY = 400;
export const MAX_PAGES_PER_RUN = 3;
export const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
export const ENRICHMENT_BATCH_SIZE = 20;
export const ENRICHMENT_DELAY = 400;

export interface BlingConnection {
  id: string;
  tenant_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function ensureValidToken(supabase: ServiceClient, connection: BlingConnection): Promise<string> {
  return ensureBlingToken(supabase, connection, '[PRODUCTS-JOB]');
}

export async function updateJobProgress(
  supabase: ServiceClient,
  jobId: string,
  updates: { current_page?: number; resume_page?: number; processed_count?: number; saved_count?: number; total_count?: number }
) {
  await supabase.from('bling_sync_jobs').update({
    ...updates,
    last_heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

export async function getJobStatus(supabase: ServiceClient, jobId: string): Promise<{ cancelled: boolean; locked: boolean }> {
  const { data } = await supabase.from('bling_sync_jobs').select('status, locked_at, locked_by').eq('id', jobId).single();
  if (!data) return { cancelled: true, locked: false };
  const cancelled = data.status === 'cancelled';
  const lockedByOther = data.locked_by && data.locked_by !== Deno.env.get('DENO_DEPLOYMENT_ID');
  const lockExpired = data.locked_at && new Date(data.locked_at).getTime() < Date.now() - LOCK_TIMEOUT_MS;
  return { cancelled, locked: lockedByOther && !lockExpired };
}

export async function acquireLock(supabase: ServiceClient, jobId: string, log: Log): Promise<boolean> {
  const lockId = Deno.env.get('DENO_DEPLOYMENT_ID') || `lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const lockExpireThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  const { data: currentJob } = await supabase.from('bling_sync_jobs').select('locked_at, locked_by').eq('id', jobId).single();
  if (!currentJob) return false;

  if (currentJob.locked_at) {
    const lockedAt = new Date(currentJob.locked_at);
    if (lockedAt > lockExpireThreshold) {
      log.info(`[PRODUCTS-JOB] Job ${jobId} locked by ${currentJob.locked_by} at ${currentJob.locked_at}`);
      return false;
    }
  }

  const { data, error } = await supabase.from('bling_sync_jobs').update({
    locked_at: now.toISOString(), locked_by: lockId,
    last_heartbeat_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq('id', jobId).select().single();

  if (error || !data) { log.error(`[PRODUCTS-JOB] Error acquiring lock:`, error); return false; }
  if (data.locked_by !== lockId) { log.info(`[PRODUCTS-JOB] Lost lock race for job ${jobId}`); return false; }

  log.info(`[PRODUCTS-JOB] Acquired lock for job ${jobId}`);
  return true;
}

export async function releaseLock(supabase: ServiceClient, jobId: string) {
  await supabase.from('bling_sync_jobs').update({
    locked_at: null, locked_by: null, updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}
