import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import { createLogger } from "../_shared/correlation.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";

type Log = ReturnType<typeof createLogger>;

export const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
export const RATE_LIMIT_DELAY = 400;

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function ensureValidToken(supabase: ServiceClient, connection: Record<string, unknown>): Promise<string> {
  return ensureBlingToken(supabase, connection, '[BLING-JOB]');
}

export function safeParseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr === '' || dateStr === 'null') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch { return null; }
}

export async function fetchOrderDetails(accessToken: string, orderId: number, log: Log): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${BLING_API_BASE}/pedidos/vendas/${orderId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  if (!response.ok) { log.warn(`[BLING-JOB] Order details fetch failed for ${orderId}: ${response.status}`); return null; }
  const result = await response.json();
  return result.data || null;
}

export async function fetchProductDetails(accessToken: string, productId: number, log: Log): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${BLING_API_BASE}/produtos/${productId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  if (!response.ok) { log.warn(`[BLING-JOB] Product details fetch failed for ${productId}: ${response.status}`); return null; }
  const result = await response.json();
  return result.data || null;
}
