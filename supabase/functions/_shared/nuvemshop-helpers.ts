/**
 * Nuvemshop API helpers — auth header, paginação, rate limit, fetch wrapper.
 * API docs: https://tiendanube.github.io/api-documentation/
 *
 * Importante:
 *  - Header de auth é `Authentication: bearer <token>` (NÃO `Authorization`).
 *  - User-Agent identifica o app (exigido).
 *  - Pagination: query `?page=N&per_page=200` (max 200).
 *  - Rate limit: 40 req / hora pra produtos novos, 2/s média, retorna 429.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptSecret } from "./secret-crypto.ts";
import { createLogger } from "./correlation.ts";

const log = createLogger("nuvemshop-helpers", "shared");

// API base: https://api.tiendanube.com/v1/{store_id} (também aceita api.nuvemshop.com.br).
// Versão atual da REST API é v1. A variável NUVEMSHOP_API_VERSION está reservada
// para futura migração quando a Nuvemshop versionar a API.
export const NUVEMSHOP_API_VERSION = Deno.env.get("NUVEMSHOP_API_VERSION") || "v1";
export const NUVEMSHOP_USER_AGENT = Deno.env.get("NUVEMSHOP_USER_AGENT") || "CRM Spy Pro (lojaoutback@gmail.com)";
export const NUVEMSHOP_PAGE_SIZE = 200;
export const NUVEMSHOP_API_HOST = Deno.env.get("NUVEMSHOP_API_HOST") || "https://api.tiendanube.com";

export type ServiceClient = ReturnType<typeof createClient>;

export interface NuvemshopConnection {
  id: string;
  tenant_id: string;
  store_id: number;
  access_token_encrypted: string | null;
}

export function nuvemshopApiBase(storeId: number | string): string {
  return `${NUVEMSHOP_API_HOST}/${NUVEMSHOP_API_VERSION}/${storeId}`;
}

export function nuvemshopHeaders(accessToken: string): Record<string, string> {
  return {
    "Authentication": `bearer ${accessToken}`,
    "User-Agent": NUVEMSHOP_USER_AGENT,
    "Content-Type": "application/json",
  };
}

/**
 * Resolve plaintext access_token from a Nuvemshop connection row (decrypts via vault).
 */
export async function getNuvemshopAccessToken(
  supabase: ServiceClient,
  connection: Pick<NuvemshopConnection, "access_token_encrypted">,
): Promise<string | null> {
  if (!connection.access_token_encrypted) return null;
  return await decryptSecret(supabase, connection.access_token_encrypted);
}

/**
 * Fetch helper with built-in rate-limit handling.
 * Nuvemshop returns 429 + `Retry-After` header on throttle.
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 250; // soft cap ~4 req/s
export async function nuvemshopFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const now = Date.now();
  const since = now - lastRequestTime;
  if (since < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - since));
  }
  lastRequestTime = Date.now();

  const headers = { ...nuvemshopHeaders(accessToken), ...(init.headers as Record<string, string> | undefined) };
  let res = await fetch(url, { ...init, headers });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
    log.warn(`[nuvemshop-fetch] 429 throttled — waiting ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    lastRequestTime = Date.now();
    res = await fetch(url, { ...init, headers });
  }
  return res;
}

/**
 * Resolve Nuvemshop connection from an integrations row.
 * Returns store_id + access_token (plaintext, decrypted) for API calls.
 */
export async function resolveNuvemshopConnection(
  supabase: ServiceClient,
  integrationId: string,
): Promise<{ connection: NuvemshopConnection; accessToken: string } | null> {
  const { data: integration } = await supabase.from("integrations")
    .select("id, tenant_id, metadata")
    .eq("id", integrationId)
    .maybeSingle();
  if (!integration) return null;
  const metadata = (integration.metadata && typeof integration.metadata === "object")
    ? integration.metadata as Record<string, unknown>
    : {};
  const connectionId = metadata.nuvemshop_connection_id as string | undefined;
  if (!connectionId) return null;

  const { data: connection } = await supabase.from("nuvemshop_connections")
    .select("id, tenant_id, store_id, access_token_encrypted")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection) return null;

  const accessToken = await getNuvemshopAccessToken(supabase, connection);
  if (!accessToken) {
    log.error(`[nuvemshop-helpers] Could not decrypt access_token for connection ${connectionId}`);
    return null;
  }
  return { connection: connection as NuvemshopConnection, accessToken };
}

/**
 * HMAC-SHA256 verification for Nuvemshop webhooks.
 * Header: `x-linkedstore-hmac-sha256` — value is HEX-encoded.
 * Body must be the RAW request body (not parsed JSON).
 * Reference: hash_hmac('sha256', $data, APP_SECRET) in PHP example.
 */
export async function verifyNuvemshopHmac(
  rawBody: string,
  receivedHmacHex: string | null,
  clientSecret: string,
): Promise<boolean> {
  if (!receivedHmacHex) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(clientSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return timingSafeEqual(computed.toLowerCase(), receivedHmacHex.toLowerCase());
  } catch (e) {
    log.error("[nuvemshop-helpers] HMAC verification failed:", e);
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/**
 * Extract `Link` header pagination from Nuvemshop responses.
 * Returns `true` if there's a next page.
 */
export function hasNextPage(res: Response): boolean {
  const linkHeader = res.headers.get("Link") || "";
  return /rel="next"/i.test(linkHeader);
}

/**
 * Helper: get-or-create sync_state row for an entityType.
 */
export async function getOrCreateNuvemshopSyncState(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  entityType: "customers" | "products" | "orders",
) {
  const { data } = await supabase.from("nuvemshop_sync_state")
    .select("id, last_page, records_synced, total_count")
    .eq("integration_id", integrationId)
    .eq("entity_type", entityType)
    .maybeSingle();
  if (data) return data;

  const { data: created } = await supabase.from("nuvemshop_sync_state").insert({
    integration_id: integrationId,
    tenant_id: tenantId,
    entity_type: entityType,
    last_page: 0,
    records_synced: 0,
  }).select("id, last_page, records_synced, total_count").single();
  return created;
}

export async function updateNuvemshopSyncState(
  supabase: ServiceClient,
  stateId: string,
  updates: Record<string, unknown>,
) {
  await supabase.from("nuvemshop_sync_state").update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq("id", stateId);
}
