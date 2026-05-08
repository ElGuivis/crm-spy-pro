/**
 * Shared CORS headers for Edge Functions.
 * 
 * - `getRestrictedCorsHeaders(req)`: Restricted to env-configured origins (authenticated endpoints).
 * - `publicCorsHeaders`: Allows any origin (webhooks, callbacks, public APIs).
 * 
 * Usage:
 *   import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
 *   // or for webhooks:
 *   import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
 */

import { ALLOWED_ORIGINS, isAllowedOrigin } from "./frontend-config.ts";

/** Resolve origin for authenticated endpoints — strict allowlist, no wildcards */
export function resolveOrigin(req: Request): string {
  const origin = req.headers.get("Origin") || "";
  if (isAllowedOrigin(origin)) return origin;
  return ALLOWED_ORIGINS[0]; // Fallback to primary (never reflects unknown origins)
}

/** CORS headers for authenticated endpoints (restricted origin) */
export function getRestrictedCorsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** Public CORS headers (any origin — for webhooks/callbacks) */
export const publicCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
