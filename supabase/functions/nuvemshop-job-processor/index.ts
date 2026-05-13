/**
 * Nuvemshop job processor — INTERNAL.
 * Called by the watchdog cron when nuvemshop_sync_state.last_page > 0 and
 * updated_at is stale (≥90s). Continues the sync where it left off.
 *
 * Body: { integration_id }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { resolveNuvemshopConnection, ServiceClient } from "../_shared/nuvemshop-helpers.ts";
import { syncNuvemshopCustomers } from "../_shared/nuvemshop-sync-customers.ts";
import { syncNuvemshopProducts } from "../_shared/nuvemshop-sync-products.ts";
import { syncNuvemshopOrders } from "../_shared/nuvemshop-sync-orders.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const SYNC_TIME_BUDGET_MS = 110_000;

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-job-processor", cid);

  try {
    requireInternalAuth(req);

    const body = await req.json().catch(() => ({}));
    const integrationId = body.integration_id as string | undefined;
    if (!integrationId) {
      return new Response(JSON.stringify({ error: "integration_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ) as ServiceClient;

    const resolved = await resolveNuvemshopConnection(supabase, integrationId);
    if (!resolved) {
      log.warn(`[nuvemshop-job] connection not resolved for ${integrationId} — skipping`);
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { connection, accessToken } = resolved;

    EdgeRuntime.waitUntil(continueSync(supabase, integrationId, connection.tenant_id, connection.store_id, accessToken));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    log.error("[nuvemshop-job-processor] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function continueSync(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  storeId: number,
  accessToken: string,
) {
  const log = createLogger("nuvemshop-job-processor", "bg");
  const deadline = Date.now() + SYNC_TIME_BUDGET_MS;

  // Find pending entity types
  const { data: pending } = await supabase.from("nuvemshop_sync_state")
    .select("entity_type, last_page")
    .eq("integration_id", integrationId)
    .gt("last_page", 0);

  if (!pending || pending.length === 0) {
    log.info("[nuvemshop-job-processor] Nothing pending for integration", integrationId);
    return;
  }

  for (const row of pending) {
    if (Date.now() >= deadline) break;
    const t = row.entity_type as string;
    try {
      if (t === "customers") await syncNuvemshopCustomers(supabase, integrationId, tenantId, storeId, accessToken, deadline);
      else if (t === "products") await syncNuvemshopProducts(supabase, integrationId, tenantId, storeId, accessToken, deadline);
      else if (t === "orders") await syncNuvemshopOrders(supabase, integrationId, tenantId, storeId, accessToken, deadline);
    } catch (e) {
      log.error(`[nuvemshop-job-processor] ${t} failed:`, (e as Error).message);
    }
  }
}
