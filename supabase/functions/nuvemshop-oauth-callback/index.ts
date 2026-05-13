/**
 * Nuvemshop OAuth callback — public endpoint (no JWT).
 *
 * Flow:
 *   1. Receive GET with ?code=...&state=...
 *   2. Look up state in oauth_states (one-time, 10-min TTL)
 *   3. POST to https://www.tiendanube.com/apps/authorize/token with
 *      client_id/client_secret/grant_type=authorization_code/code
 *   4. Upsert nuvemshop_connections (token encrypted by DB trigger)
 *   5. Upsert integrations (type='nuvemshop')
 *   6. Register operational + LGPD webhooks (best-effort)
 *   7. 302 redirect → ${frontend}/integrations?ns_success=1
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { nuvemshopApiBase, nuvemshopFetch } from "../_shared/nuvemshop-helpers.ts";

const NUVEMSHOP_APP_ID = Deno.env.get("NUVEMSHOP_APP_ID")?.trim();
const NUVEMSHOP_CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

const OPERATIONAL_EVENTS = [
  "order/created",
  "order/updated",
  "order/paid",
  "order/cancelled",
  "order/fulfilled",
  "product/created",
  "product/updated",
  "product/deleted",
  "customer/created",
  "customer/updated",
  "app/uninstalled",
] as const;

const LGPD_EVENTS = [
  "store/redact",
  "customers/redact",
  "customers/data_request",
] as const;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-oauth-callback", cid);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const safeRedirect = (frontend: string, qs: string) =>
    new Response(null, { status: 302, headers: { Location: `${frontend}/integrations?${qs}` } });

  let frontendUrl = PRIMARY_FRONTEND_URL;

  try {
    if (errParam) {
      log.error("[nuvemshop-oauth-callback] OAuth provider error:", errParam);
      return safeRedirect(frontendUrl, `ns_error=${encodeURIComponent(errParam)}`);
    }
    if (!code || !stateParam) {
      return safeRedirect(frontendUrl, "ns_error=missing_params");
    }
    if (!NUVEMSHOP_APP_ID || !NUVEMSHOP_CLIENT_SECRET) {
      log.error("[nuvemshop-oauth-callback] App credentials missing");
      return safeRedirect(frontendUrl, "ns_error=server_misconfigured");
    }

    // 1. Validate state (one-time use, 10-min TTL)
    const { data: stateData } = await supabase.from("oauth_states")
      .select("id, state, provider, user_id, tenant_id, frontend_url, expires_at")
      .eq("state", stateParam)
      .eq("provider", "nuvemshop")
      .maybeSingle();

    if (!stateData) {
      log.error("[nuvemshop-oauth-callback] Invalid state:", stateParam);
      return safeRedirect(frontendUrl, "ns_error=invalid_state");
    }
    if (stateData.frontend_url) frontendUrl = stateData.frontend_url;
    if (new Date(stateData.expires_at) < new Date()) {
      await supabase.from("oauth_states").delete().eq("id", stateData.id);
      return safeRedirect(frontendUrl, "ns_error=state_expired");
    }
    await supabase.from("oauth_states").delete().eq("id", stateData.id);

    // 2. Exchange code for token
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: NUVEMSHOP_APP_ID,
        client_secret: NUVEMSHOP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token || !tokenData.user_id) {
      log.error("[nuvemshop-oauth-callback] Token exchange failed:", tokenData);
      return safeRedirect(frontendUrl, "ns_error=token_exchange_failed");
    }

    const accessToken = tokenData.access_token as string;
    const storeId = Number(tokenData.user_id);
    const scope = (tokenData.scope as string) || null;

    // 3. Fetch store info (best-effort)
    let storeName: string | null = null;
    let storeUrl: string | null = null;
    let storeCountry: string | null = null;
    let storeEmail: string | null = null;
    try {
      const storeRes = await nuvemshopFetch(`${nuvemshopApiBase(storeId)}/store`, accessToken);
      if (storeRes.ok) {
        const s = await storeRes.json();
        const nameObj = s.name;
        storeName = typeof nameObj === "string" ? nameObj : (nameObj?.pt || nameObj?.["pt-br"] || nameObj?.en || null);
        storeUrl = s.original_domain || s.url || null;
        storeCountry = s.country || null;
        storeEmail = s.email || null;
      }
    } catch (e) {
      log.warn("[nuvemshop-oauth-callback] Could not fetch /store:", (e as Error).message);
    }

    // 4. Upsert nuvemshop_connections (trigger encrypts access_token)
    const { data: connection, error: connErr } = await supabase
      .from("nuvemshop_connections")
      .upsert({
        tenant_id: stateData.tenant_id,
        created_by_user_id: stateData.user_id,
        store_id: storeId,
        store_name: storeName,
        store_url: storeUrl,
        store_country: storeCountry,
        store_email: storeEmail,
        scope,
        access_token: accessToken,
        status: "connected",
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,store_id" })
      .select("id")
      .single();

    if (connErr || !connection) {
      log.error("[nuvemshop-oauth-callback] Failed to upsert connection:", connErr);
      return safeRedirect(frontendUrl, "ns_error=connection_save_failed");
    }

    // 5. Upsert integration row (display in /integrations)
    const { data: existingInt } = await supabase
      .from("integrations")
      .select("id")
      .eq("tenant_id", stateData.tenant_id)
      .eq("type", "nuvemshop")
      .maybeSingle();

    let integrationId: string;
    if (existingInt) {
      integrationId = existingInt.id;
      await supabase.from("integrations").update({
        name: storeName || "Nuvemshop",
        status: "connected",
        metadata: { nuvemshop_connection_id: connection.id, store_id: storeId },
      }).eq("id", integrationId);
    } else {
      const { data: newInt, error: newIntErr } = await supabase.from("integrations").insert({
        tenant_id: stateData.tenant_id,
        type: "nuvemshop",
        name: storeName || "Nuvemshop",
        status: "connected",
        metadata: { nuvemshop_connection_id: connection.id, store_id: storeId },
      }).select("id").single();
      if (newIntErr) {
        log.error("[nuvemshop-oauth-callback] Failed to insert integration:", newIntErr);
        return safeRedirect(frontendUrl, "ns_error=integration_save_failed");
      }
      integrationId = newInt.id;
    }

    // 6. Register webhooks (best-effort, non-blocking)
    registerWebhooks(supabase, integrationId, storeId, accessToken, log).catch((e) => {
      log.error("[nuvemshop-oauth-callback] Webhook registration failed (non-fatal):", e);
    });

    log.info(`[nuvemshop-oauth-callback] Connected store ${storeId} for tenant ${stateData.tenant_id}`);
    return safeRedirect(frontendUrl, `ns_success=1&integration_id=${integrationId}`);
  } catch (error) {
    log.error("[nuvemshop-oauth-callback] Fatal error:", error);
    return safeRedirect(frontendUrl, "ns_error=internal");
  }
});

async function registerWebhooks(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
  storeId: number,
  accessToken: string,
  // deno-lint-ignore no-explicit-any
  log: any,
): Promise<void> {
  const notifyUrlOperational = `${SUPABASE_URL}/functions/v1/nuvemshop-webhook`;
  const notifyUrlLgpd = `${SUPABASE_URL}/functions/v1/nuvemshop-webhook-lgpd`;
  const base = nuvemshopApiBase(storeId);
  const registered: string[] = [];
  const errors: string[] = [];

  // Fetch existing webhooks to avoid duplicates
  let existingByEvent = new Map<string, number>();
  try {
    const listRes = await nuvemshopFetch(`${base}/webhooks?per_page=200`, accessToken);
    if (listRes.ok) {
      const items: Array<{ id: number; event: string; url: string }> = await listRes.json();
      for (const w of items) existingByEvent.set(`${w.event}::${w.url}`, w.id);
    }
  } catch (_) { /* ignore */ }

  const allEvents: Array<[string, string]> = [
    ...OPERATIONAL_EVENTS.map((e) => [e, notifyUrlOperational] as [string, string]),
    ...LGPD_EVENTS.map((e) => [e, notifyUrlLgpd] as [string, string]),
  ];

  for (const [event, urlForEvent] of allEvents) {
    if (existingByEvent.has(`${event}::${urlForEvent}`)) {
      registered.push(event);
      continue;
    }
    try {
      const res = await nuvemshopFetch(`${base}/webhooks`, accessToken, {
        method: "POST",
        body: JSON.stringify({ event, url: urlForEvent }),
      });
      if (res.ok) {
        registered.push(event);
      } else {
        const txt = await res.text();
        errors.push(`${event}: ${res.status} ${txt.slice(0, 200)}`);
      }
    } catch (e) {
      errors.push(`${event}: ${(e as Error).message}`);
    }
  }

  log.info(`[nuvemshop-webhooks] Registered: ${registered.join(", ") || "none"}`);
  if (errors.length) log.warn(`[nuvemshop-webhooks] Errors: ${errors.join(" | ")}`);

  // Persist registration metadata on the integration
  const { data: cur } = await supabase.from("integrations").select("metadata").eq("id", integrationId).single();
  const curMeta = (cur?.metadata && typeof cur.metadata === "object") ? (cur.metadata as Record<string, unknown>) : {};
  await supabase.from("integrations").update({
    metadata: {
      ...curMeta,
      webhooks_registered: registered,
      webhooks_registered_at: new Date().toISOString(),
      webhooks_errors: errors,
    },
  }).eq("id", integrationId);
}
