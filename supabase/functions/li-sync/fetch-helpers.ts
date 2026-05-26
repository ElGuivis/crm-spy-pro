import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

export const LI_API_BASE = 'https://api.awsli.com.br/v1';
export const PAGE_SIZE = 50;
export const RATE_LIMIT_DELAY = 200;
export const SYNC_TIME_BUDGET_MS = 110_000;

let lastRequestTime = 0;

export async function rateLimitedFetch(url: string, authHeader: string): Promise<Response> {
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

export async function getOrCreateSyncState(
  supabase: ServiceClient, integrationId: string, tenantId: string, entityType: string
) {
  const { data, error } = await supabase.from('li_sync_state')
    .select('id, integration_id, entity_type, last_synced_at, last_offset, last_cursor, records_synced, total_count')
    .eq('integration_id', integrationId).eq('entity_type', entityType).maybeSingle();

  if (error) log.error(`[LI-SYNC] getOrCreateSyncState select error: ${error.message}`);

  if (!data) {
    const { data: created, error: insErr } = await supabase.from('li_sync_state')
      .insert({ integration_id: integrationId, tenant_id: tenantId, entity_type: entityType })
      .select().single();
    if (insErr) log.error(`[LI-SYNC] getOrCreateSyncState insert error: ${insErr.message}`);
    return created;
  }
  return data;
}

export async function updateSyncState(supabase: ServiceClient, stateId: string, updates: Record<string, unknown>) {
  await supabase.from('li_sync_state').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', stateId);
}
