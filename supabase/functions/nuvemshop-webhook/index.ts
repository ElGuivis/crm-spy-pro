/**
 * Nuvemshop operational webhook — PUBLIC endpoint.
 *
 * Receives: order/*, product/*, customer/*, app/uninstalled.
 * Auth: HMAC-SHA256 hex in header `x-linkedstore-hmac-sha256`, signed with
 *       NUVEMSHOP_CLIENT_SECRET over the raw request body.
 *
 * Payload shape: { store_id, event, id, ... }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import {
  ServiceClient,
  verifyNuvemshopHmac,
  nuvemshopApiBase,
  nuvemshopFetch,
  resolveNuvemshopConnection,
} from "../_shared/nuvemshop-helpers.ts";
import { upsertNuvemshopOrder } from "../_shared/nuvemshop-sync-orders.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const NUVEMSHOP_CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET")?.trim();

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-webhook", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  if (!NUVEMSHOP_CLIENT_SECRET) {
    log.error("[nuvemshop-webhook] NUVEMSHOP_CLIENT_SECRET not configured");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-linkedstore-hmac-sha256");
  const hmacValid = await verifyNuvemshopHmac(rawBody, hmacHeader, NUVEMSHOP_CLIENT_SECRET);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!hmacValid) {
    log.error("[nuvemshop-webhook] HMAC verification failed", { event: payload.event });
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = String(payload.event || "unknown");
  const storeId = Number(payload.store_id);
  const resourceId = String(payload.id || "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ) as ServiceClient;

  // Find the integration for this store
  const { data: connection } = await supabase
    .from("nuvemshop_connections")
    .select("id, tenant_id, store_id")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!connection) {
    log.warn("[nuvemshop-webhook] No connection for store_id", storeId);
    // Still 200 — Nuvemshop will retry otherwise. We don't own this store.
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: integration } = await supabase.from("integrations")
    .select("id, metadata")
    .eq("tenant_id", connection.tenant_id)
    .eq("type", "nuvemshop")
    .maybeSingle();

  if (!integration) {
    log.warn("[nuvemshop-webhook] No integration row for tenant", connection.tenant_id);
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dedupeKey = `${event}:${storeId}:${resourceId}:${payload.event_launch_ts || Date.now()}`;

  // Idempotent persist
  const { data: eventRow } = await supabase.from("nuvemshop_webhook_events").upsert({
    integration_id: integration.id,
    tenant_id: connection.tenant_id,
    event,
    store_id: storeId,
    resource_id: resourceId,
    payload_json: payload,
    status: "received",
    dedupe_key: dedupeKey,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id, status")
    .maybeSingle();

  if (eventRow && eventRow.status !== "received") {
    return new Response(JSON.stringify({ ok: true, deduplicated: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventId = eventRow?.id;

  // Respond 200 immediately, process async
  EdgeRuntime.waitUntil(processEvent(supabase, eventId, integration.id, connection.tenant_id, connection.store_id, event, resourceId));

  return new Response(JSON.stringify({ ok: true, eventId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function processEvent(
  supabase: ServiceClient,
  eventId: string | undefined,
  integrationId: string,
  tenantId: string,
  storeId: number,
  event: string,
  resourceId: string,
) {
  const log = createLogger("nuvemshop-webhook", "bg");
  if (eventId) {
    await supabase.from("nuvemshop_webhook_events").update({ status: "processing" }).eq("id", eventId);
  }

  try {
    const resolved = await resolveNuvemshopConnection(supabase, integrationId);
    if (!resolved) throw new Error("Connection not resolved");
    const { accessToken } = resolved;

    if (event === "app/uninstalled") {
      // Merchant uninstalled the app — mark connection disconnected, keep data for LGPD window
      await supabase.from("nuvemshop_connections").update({
        status: "disconnected",
        access_token_encrypted: null,
      }).eq("store_id", storeId);
      await supabase.from("integrations").update({
        status: "disconnected",
        error_message: "App desinstalado pelo lojista",
      }).eq("id", integrationId);
    } else if (event.startsWith("order/")) {
      const res = await nuvemshopFetch(`${nuvemshopApiBase(storeId)}/orders/${resourceId}`, accessToken);
      if (res.ok) {
        const order = await res.json();
        await upsertNuvemshopOrder(supabase, order, integrationId, tenantId);
      }
    } else if (event.startsWith("product/")) {
      if (event === "product/deleted") {
        await supabase.from("nuvemshop_products")
          .delete()
          .eq("integration_id", integrationId)
          .eq("nuvemshop_product_id", Number(resourceId));
      } else {
        const res = await nuvemshopFetch(`${nuvemshopApiBase(storeId)}/products/${resourceId}`, accessToken);
        if (res.ok) {
          const p = await res.json();
          await supabase.from("nuvemshop_products").upsert({
            integration_id: integrationId,
            tenant_id: tenantId,
            nuvemshop_product_id: p.id,
            name: typeof p.name === "string" ? p.name : (p.name?.pt || p.name?.["pt-br"] || "Sem nome"),
            sku: p.variants?.[0]?.sku || null,
            price: p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : null,
            promotional_price: p.variants?.[0]?.promotional_price ? parseFloat(p.variants[0].promotional_price) : null,
            stock: p.variants?.[0]?.stock_management ? p.variants.reduce((acc: number, v: Record<string, unknown>) => acc + ((v.stock as number) || 0), 0) : null,
            stock_managed: !!p.variants?.[0]?.stock_management,
            active: p.published !== false,
            variations_json: p.variants || null,
            image_url: p.images?.[0]?.src || null,
            raw_json: p,
            updated_at_remote: p.updated_at || null,
            updated_at_local: new Date().toISOString(),
          }, { onConflict: "integration_id,nuvemshop_product_id" });
        }
      }
    } else if (event.startsWith("customer/")) {
      const res = await nuvemshopFetch(`${nuvemshopApiBase(storeId)}/customers/${resourceId}`, accessToken);
      if (res.ok) {
        const c = await res.json();
        await supabase.from("nuvemshop_customers").upsert({
          integration_id: integrationId,
          tenant_id: tenantId,
          nuvemshop_customer_id: c.id,
          name: c.name || "Sem nome",
          email: c.email || null,
          phone: c.phone || null,
          doc: c.identification || null,
          address_json: c.default_address || c.addresses?.[0] || null,
          total_spent: c.total_spent ? parseFloat(c.total_spent) : null,
          raw_json: c,
          updated_at_remote: c.updated_at || null,
          updated_at_local: new Date().toISOString(),
        }, { onConflict: "integration_id,nuvemshop_customer_id" });
      }
    }

    if (eventId) {
      await supabase.from("nuvemshop_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("id", eventId);
    }
    await supabase.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integrationId);
    log.info(`[nuvemshop-webhook] ${event} processed for ${resourceId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`[nuvemshop-webhook] event ${event}/${resourceId} failed:`, msg);
    if (eventId) {
      await supabase.from("nuvemshop_webhook_events").update({
        status: "failed",
        error: msg,
        retry_count: 1,
      }).eq("id", eventId);
    }
  }
}
