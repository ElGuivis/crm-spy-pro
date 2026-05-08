import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "./cors.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("resource-guard", "shared");


/**
 * Resource Guard — tenant-scoped resource validation for edge functions.
 *
 * Prevents cross-tenant access by validating that a resource belongs to the
 * authenticated user's tenant before allowing any operation.
 *
 * CORS: Uses restricted origin resolver. The `req` parameter is REQUIRED.
 *
 * Usage:
 *   const conversation = await requireResource(supabase, 'conversations', conversationId, tenantId, req);
 */

// Use a permissive client type so callers can pass any schema variant
// without TS inferring `never` for table/row shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;
// Touch createClient to keep import stable for downstream re-exports.
void createClient;

/** Tables that support tenant_id scoping */
export type TenantScopedTable =
  | "conversations"
  | "contacts"
  | "integrations"
  | "instagram_channels"
  | "instagram_threads"
  | "instagram_contacts"
  | "instagram_flows"
  | "instagram_flow_versions"
  | "instagram_flow_runs"
  | "instagram_cta_links"
  | "instagram_content"
  | "instagram_deep_links"
  | "kanban_columns"
  | "ai_agents"
  | "email_campaigns"
  | "email_templates"
  | "email_integrations"
  | "email_integration_senders"
  | "bling_connections"
  | "bling_orders"
  | "bling_customers"
  | "bling_products"
  | "bling_sync_jobs"
  | "bling_sync_logs"
  | "melhor_envio_tokens"
  | "me_shipments"
  | "me_sync_jobs"
  | "abandoned_cart_configs"
  | "birthday_configs"
  | "bulk_campaigns"
  | "auto_messages"
  | "crm_segments"
  | "rfm_audiences"
  | "tenant_ai_credentials"
  | "generated_coupons";

/** Build error headers — always restricted CORS */
function errorHeaders(req: Request): Record<string, string> {
  return { ...getRestrictedCorsHeaders(req), "Content-Type": "application/json" };
}

/**
 * Validate that a resource exists and belongs to the specified tenant.
 * Throws a Response (403/400/500) if the resource is not found or belongs to another tenant.
 *
 * @param supabase  Service-role client
 * @param table     Table name (must have tenant_id column)
 * @param id        Resource UUID
 * @param tenantId  Authenticated user's tenant UUID
 * @param req       Original request (REQUIRED for restricted CORS headers)
 * @param select    Optional select clause (default: "id, tenant_id")
 * @returns         The resource row
 */
export async function requireResource<T = Record<string, unknown>>(
  supabase: ServiceClient,
  table: TenantScopedTable,
  id: string,
  tenantId: string,
  req: Request,
  select = "id, tenant_id"
): Promise<T> {
  if (!id) {
    throw new Response(
      JSON.stringify({ error: "Bad request: missing resource id" }),
      { status: 400, headers: errorHeaders(req) }
    );
  }

  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    log.error(`[resource-guard] Query error on ${table}:`, error.message);
    throw new Response(
      JSON.stringify({ error: "Internal error validating resource" }),
      { status: 500, headers: errorHeaders(req) }
    );
  }

  if (!data) {
    log.warn(
      `[resource-guard] Access denied: ${table}/${id} not found for tenant ${tenantId}`
    );
    throw new Response(
      JSON.stringify({ error: "Forbidden: resource not found for this tenant" }),
      { status: 403, headers: errorHeaders(req) }
    );
  }

  return data as T;
}

/**
 * Validate multiple resources at once (batch check).
 * Useful when a function receives several resource IDs.
 */
export async function requireResources(
  supabase: ServiceClient,
  checks: Array<{ table: TenantScopedTable; id: string }>,
  tenantId: string,
  req: Request
): Promise<void> {
  await Promise.all(
    checks
      .filter((c) => !!c.id)
      .map((c) => requireResource(supabase, c.table, c.id, tenantId, req))
  );
}

/**
 * Soft check — returns true/false instead of throwing.
 * Use when you want to handle the mismatch yourself.
 */
export async function isResourceOwnedByTenant(
  supabase: ServiceClient,
  table: TenantScopedTable,
  id: string,
  tenantId: string
): Promise<boolean> {
  if (!id) return false;

  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return !!data;
}
