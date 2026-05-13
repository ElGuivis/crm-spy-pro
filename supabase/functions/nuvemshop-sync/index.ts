/**
 * Nuvemshop full sync — user-triggered.
 *
 * Returns 202 immediately and runs runFullSync via EdgeRuntime.waitUntil
 * with a ~110s time budget. If sync doesn't finish (large stores), the
 * `nuvemshop-sync-watchdog` cron picks it up via `nuvemshop-job-processor`.
 *
 * Body: { integrationId, syncType?: 'customers'|'products'|'orders'|'all' }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
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
  const log = createLogger("nuvemshop-sync", cid);

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const integrationId = body.integrationId as string | undefined;
    const syncType = (body.syncType as string) || "all";

    if (!integrationId) {
      return new Response(JSON.stringify({ error: "integrationId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ) as ServiceClient;

    if (!auth.isInternal && auth.tenantId) {
      await requireResource(supabase, "integrations", integrationId, auth.tenantId, req);
    }

    const resolved = await resolveNuvemshopConnection(supabase, integrationId);
    if (!resolved) {
      return new Response(JSON.stringify({ error: "Nuvemshop connection not found or token decryption failed" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { connection, accessToken } = resolved;

    await supabase.from("integrations").update({
      last_sync_at: new Date().toISOString(),
      initial_sync_completed: true,
      error_message: null,
    }).eq("id", integrationId);

    const syncId = crypto.randomUUID();
    log.info(`[nuvemshop-sync] start syncId=${syncId} type=${syncType} integration=${integrationId}`);

    EdgeRuntime.waitUntil(runFullSync(
      supabase, integrationId, connection.tenant_id, connection.store_id, accessToken, syncType,
    ));

    return new Response(JSON.stringify({ success: true, syncId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    log.error("[nuvemshop-sync] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runFullSync(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  storeId: number,
  accessToken: string,
  syncType: string,
) {
  const log = createLogger("nuvemshop-sync", "bg");
  const types = syncType === "all" ? ["customers", "products", "orders"] as const : [syncType] as const;
  const deadline = Date.now() + SYNC_TIME_BUDGET_MS;

  for (const t of types) {
    if (Date.now() >= deadline) break;
    try {
      if (t === "customers") await syncNuvemshopCustomers(supabase, integrationId, tenantId, storeId, accessToken, deadline);
      else if (t === "products") await syncNuvemshopProducts(supabase, integrationId, tenantId, storeId, accessToken, deadline);
      else if (t === "orders") await syncNuvemshopOrders(supabase, integrationId, tenantId, storeId, accessToken, deadline);
    } catch (e) {
      log.error(`[nuvemshop-sync] ${t} failed:`, (e as Error).message);
    }
  }

  // Check whether any entityType is still pending (last_page > 0)
  const { data: pending } = await supabase.from("nuvemshop_sync_state")
    .select("entity_type, last_page")
    .eq("integration_id", integrationId)
    .gt("last_page", 0);
  if (pending && pending.length > 0) {
    log.warn(`[nuvemshop-sync] Budget exhausted, pending: ${pending.map((p: Record<string, unknown>) => p.entity_type).join(",")}`);
    // Trigger continuation via job processor
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/nuvemshop-job-processor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ integration_id: integrationId }),
      });
    } catch (_) { /* watchdog will pick it up */ }
  } else {
    log.info("[nuvemshop-sync] Full sync complete for integration", integrationId);
  }
}
