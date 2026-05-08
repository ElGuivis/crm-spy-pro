import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "./cors.ts";

/**
 * Auth Guard — shared authentication helpers for edge functions.
 *
 * Three modes:
 *   1. requireUserAuth   — JWT validation + tenant resolution (for frontend calls)
 *   2. requireInternalAuth — CRON_SECRET or service_role validation (for cron/workers)
 *   3. requireUserOrInternalAuth — tries user first, falls back to internal (hybrid)
 *
 * CORS: All error responses use the restricted origin resolver (no wildcards).
 */

export interface UserAuthResult {
  userId: string;
  tenantId: string;
}

export interface HybridAuthResult {
  userId?: string;
  tenantId?: string;
  isInternal: boolean;
}

/** Build restricted CORS headers from the incoming request */
function errorHeaders(req: Request): Record<string, string> {
  return { ...getRestrictedCorsHeaders(req), "Content-Type": "application/json" };
}

/** Validate JWT and resolve user's tenant. Throws Response on failure. */
export async function requireUserAuth(req: Request): Promise<UserAuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: errorHeaders(req),
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: errorHeaders(req),
    });
  }

  const userId = claimsData.claims.sub as string;

  // Resolve tenant via RPC
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenantId } = await serviceClient.rpc("get_user_tenant_id", {
    _user_id: userId,
  });

  if (!tenantId) {
    throw new Response(JSON.stringify({ error: "Tenant not found for user" }), {
      status: 403,
      headers: errorHeaders(req),
    });
  }

  return { userId, tenantId };
}

/** Validate that the caller is an internal service (cron job or service_role). Throws Response on failure. */
export function requireInternalAuth(req: Request): void {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  const cronHeader = req.headers.get("x-cron-secret");

  const isServiceRole = token === serviceRoleKey;
  const isCronSecret = cronSecret && (token === cronSecret || cronHeader === cronSecret);

  if (!isServiceRole && !isCronSecret) {
    throw new Response(JSON.stringify({ error: "Unauthorized: internal access only" }), {
      status: 401,
      headers: errorHeaders(req),
    });
  }
}

/** Try user JWT first; if absent, require internal auth. Returns hybrid result. */
export async function requireUserOrInternalAuth(req: Request): Promise<HybridAuthResult> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  // Check if it's an internal call first (service_role or cron)
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (token === serviceRoleKey || (cronSecret && (token === cronSecret || req.headers.get("x-cron-secret") === cronSecret))) {
    return { isInternal: true };
  }

  // Otherwise, require valid user JWT
  const result = await requireUserAuth(req);
  return { ...result, isInternal: false };
}

/**
 * Validate that a tenant_id from the request body matches the authenticated user's tenant.
 * Use after requireUserAuth to prevent cross-tenant access.
 * `req` is REQUIRED for restricted CORS error responses.
 */
export function assertTenantMatch(authTenantId: string, bodyTenantId: string | undefined, req: Request): void {
  if (bodyTenantId && bodyTenantId !== authTenantId) {
    throw new Response(JSON.stringify({ error: "Forbidden: tenant mismatch" }), {
      status: 403,
      headers: errorHeaders(req),
    });
  }
}
