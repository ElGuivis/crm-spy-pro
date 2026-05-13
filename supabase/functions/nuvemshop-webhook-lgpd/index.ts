/**
 * Nuvemshop LGPD webhooks — PUBLIC endpoint.
 *
 * Handles the 3 mandatory data-protection events:
 *   - store/redact            : 48h after app uninstall — purge all data for that store
 *   - customers/redact        : merchant requests deletion of a customer's data
 *   - customers/data_request  : customer requests their data (we log for manual export)
 *
 * Auth: HMAC-SHA256 hex in header `x-linkedstore-hmac-sha256`, signed with
 *       NUVEMSHOP_CLIENT_SECRET over the raw request body.
 *
 * The function MUST respond 200 quickly. Heavy work happens via waitUntil.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ServiceClient, verifyNuvemshopHmac } from "../_shared/nuvemshop-helpers.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const NUVEMSHOP_CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET")?.trim();

interface LgpdPayload {
  store_id?: number;
  event?: string;
  customer?: { id?: number; email?: string; phone?: string; identification?: string };
  orders_to_redact?: number[];
  customers_to_redact?: number[];
  data_request?: { id?: number; customer?: Record<string, unknown>; orders_requested?: number[] };
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-webhook-lgpd", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always return 200 for unexpected methods to avoid breaking the merchant's app.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  // Never crash on bad payload — log + respond 200 to avoid Nuvemshop retries hammering us.
  let payload: LgpdPayload = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.error("[nuvemshop-lgpd] Invalid JSON payload — rawBody first 300 chars:", rawBody.slice(0, 300));
    return new Response(JSON.stringify({ ok: true, ignored: "invalid_json" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!NUVEMSHOP_CLIENT_SECRET) {
    log.error("[nuvemshop-lgpd] NUVEMSHOP_CLIENT_SECRET not configured");
    return new Response(JSON.stringify({ ok: true, ignored: "server_misconfigured" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const hmacHeader = req.headers.get("x-linkedstore-hmac-sha256");
  const hmacValid = await verifyNuvemshopHmac(rawBody, hmacHeader, NUVEMSHOP_CLIENT_SECRET);

  const event = String(payload.event || "unknown");
  const storeId = payload.store_id ? Number(payload.store_id) : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ) as ServiceClient;

  // Find the integration (tenant) for this store, if it exists
  let tenantId: string | null = null;
  let integrationId: string | null = null;
  if (storeId !== null && !isNaN(storeId)) {
    const { data: conn } = await supabase.from("nuvemshop_connections")
      .select("tenant_id")
      .eq("store_id", storeId)
      .maybeSingle();
    tenantId = conn?.tenant_id || null;
    if (tenantId) {
      const { data: integ } = await supabase.from("integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("type", "nuvemshop")
        .maybeSingle();
      integrationId = integ?.id || null;
    }
  }

  // Audit log every LGPD event regardless of HMAC validity (helps debugging spoof attempts).
  const { data: lgpdRow } = await supabase.from("nuvemshop_lgpd_events").insert({
    integration_id: integrationId,
    tenant_id: tenantId,
    event_type: event,
    store_id: storeId,
    customer_id: payload.customer?.id || null,
    orders_to_redact: payload.orders_to_redact || null,
    payload_json: payload as unknown as Record<string, unknown>,
    hmac_valid: hmacValid,
    status: hmacValid ? "received" : "failed",
  }).select("id").single();

  if (!hmacValid) {
    log.error("[nuvemshop-lgpd] HMAC verification FAILED — refusing to process", { event });
    // Per LGPD compliance docs, we still respond 200 (Nuvemshop will eventually stop retrying invalid signatures).
    return new Response(JSON.stringify({ ok: true, ignored: "invalid_signature" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ACK quickly, do redaction work async
  EdgeRuntime.waitUntil(processLgpdEvent(supabase, lgpdRow?.id, event, payload, integrationId, tenantId, storeId));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function processLgpdEvent(
  supabase: ServiceClient,
  lgpdRowId: string | undefined,
  event: string,
  payload: LgpdPayload,
  integrationId: string | null,
  tenantId: string | null,
  storeId: number | null,
) {
  const log = createLogger("nuvemshop-webhook-lgpd", "bg");

  try {
    if (!integrationId || !tenantId) {
      log.warn(`[nuvemshop-lgpd] No integration for store ${storeId} — event ${event} logged only`);
      if (lgpdRowId) {
        await supabase.from("nuvemshop_lgpd_events").update({
          status: "processed",
          processed_at: new Date().toISOString(),
        }).eq("id", lgpdRowId);
      }
      return;
    }

    if (event === "store/redact") {
      // 48h after uninstall — purge all data for this store
      log.info(`[nuvemshop-lgpd] store/redact for integration ${integrationId}`);

      // Order is important: items → orders → customers → products → sync_state → webhook events → connection
      await supabase.from("nuvemshop_order_items").delete().eq("tenant_id", tenantId);
      await supabase.from("nuvemshop_orders").delete().eq("integration_id", integrationId);
      await supabase.from("nuvemshop_customers").delete().eq("integration_id", integrationId);
      await supabase.from("nuvemshop_products").delete().eq("integration_id", integrationId);
      await supabase.from("nuvemshop_sync_state").delete().eq("integration_id", integrationId);
      await supabase.from("nuvemshop_webhook_events").delete().eq("integration_id", integrationId);
      await supabase.from("nuvemshop_connections").delete().eq("tenant_id", tenantId).eq("store_id", storeId);
      await supabase.from("integrations").delete().eq("id", integrationId);
    } else if (event === "customers/redact") {
      // Redact specific customer(s) — anonymize PII but keep aggregate analytics
      const customerIds: number[] = payload.customers_to_redact
        || (payload.customer?.id ? [payload.customer.id] : []);
      log.info(`[nuvemshop-lgpd] customers/redact ${customerIds.length} customer(s)`);

      for (const cid of customerIds) {
        await supabase.from("nuvemshop_customers")
          .update({
            name: "[REDACTED]",
            email: null,
            phone: null,
            doc: null,
            address_json: null,
            raw_json: { redacted: true, redacted_at: new Date().toISOString() },
          })
          .eq("integration_id", integrationId)
          .eq("nuvemshop_customer_id", cid);
      }

      // Also anonymize associated orders' shipping address (keep totals for analytics)
      const orderIds: number[] = payload.orders_to_redact || [];
      for (const oid of orderIds) {
        await supabase.from("nuvemshop_orders")
          .update({
            shipping_json: { redacted: true },
            raw_json: { redacted: true, redacted_at: new Date().toISOString() },
          })
          .eq("integration_id", integrationId)
          .eq("nuvemshop_order_id", oid);
      }
    } else if (event === "customers/data_request") {
      // Customer requests their data — we log it; merchant exports manually within 30 days.
      log.info(`[nuvemshop-lgpd] customers/data_request logged for tenant ${tenantId}`);
      // Audit row already created above — no automated export.
    } else {
      log.warn(`[nuvemshop-lgpd] Unknown LGPD event: ${event}`);
    }

    if (lgpdRowId) {
      await supabase.from("nuvemshop_lgpd_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("id", lgpdRowId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`[nuvemshop-lgpd] Failed to process ${event}: ${msg}`);
    if (lgpdRowId) {
      await supabase.from("nuvemshop_lgpd_events").update({
        status: "failed",
        processed_at: new Date().toISOString(),
      }).eq("id", lgpdRowId);
    }
  }
}
