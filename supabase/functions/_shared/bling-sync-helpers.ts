/**
 * Shared helpers for Bling sync operations.
 * Extracted from bling-sync/index.ts to reduce file size.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("bling-sync-helpers", "shared");


export const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
export const PAGE_SIZE = 100;
export const RATE_LIMIT_DELAY = 350;
export const DETAIL_FETCH_DELAY = 400;

export interface BlingConnection {
  id: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string;
  bling_company_id: string | null;
}

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Fetch paginated data from Bling API */
export async function fetchBlingData(
  accessToken: string,
  endpoint: string,
  page: number = 1,
  extraParams: Record<string, string> = {}
): Promise<{ data: Record<string, unknown>[]; hasMore: boolean; total: number }> {
  const params = new URLSearchParams({
    pagina: String(page),
    limite: String(PAGE_SIZE),
    ...extraParams,
  });

  const url = `${BLING_API_BASE}${endpoint}?${params}`;
  log.info(`[bling-sync] Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`[bling-sync] API error: ${response.status} - ${errorText}`);
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`Bling API error: ${response.status}`);
  }

  const result = await response.json();
  const data = result.data || [];
  const hasMore = data.length === PAGE_SIZE;
  const total = result.retorno?.erros ? 0 : data.length;

  return { data, hasMore, total };
}

/** Fetch single record detail from Bling API */
export async function fetchBlingDetail(
  accessToken: string,
  endpoint: string,
  label: string
): Promise<Record<string, unknown> | null> {
  const url = `${BLING_API_BASE}${endpoint}`;
  log.info(`[bling-sync] Fetching ${label}: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`[bling-sync] Error fetching ${label}: ${response.status} - ${errorText}`);
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    return null;
  }

  const result = await response.json();
  return result.data || null;
}

/** Safely parse an ISO date string */
export function safeParseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr === '' || dateStr === 'null' || dateStr === 'undefined') {
    return null;
  }
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

/** Parse Brazilian DD/MM/YYYY date to YYYY-MM-DD */
export function parseBrazilianDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr === '' || dateStr === 'null' || dateStr === 'undefined') {
    return null;
  }
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a sync job was cancelled */
export async function isJobCancelled(supabase: ServiceClient, jobId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bling_sync_jobs')
    .select('status')
    .eq('id', jobId)
    .single();
  return data?.status === 'cancelled';
}

/** Update job progress */
export async function updateJobProgress(
  supabase: ServiceClient,
  jobId: string,
  updates: Record<string, unknown>
): Promise<void> {
  await supabase
    .from('bling_sync_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}
