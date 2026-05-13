/**
 * Nuvemshop OAuth — user-facing actions.
 *
 * Actions:
 *   - generate-oauth-url : authenticated; persists state in oauth_states and
 *                          returns authorize URL https://www.tiendanube.com/apps/{APP_ID}/authorize?state=...
 *   - disconnect         : authenticated; revokes local connection + drops integration row
 *
 * The callback (`nuvemshop-oauth-callback`) is a separate public function.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { isAllowedRedirectUrl, PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const NUVEMSHOP_APP_ID = Deno.env.get("NUVEMSHOP_APP_ID")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-oauth", cid);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!NUVEMSHOP_APP_ID) {
      throw new Error("NUVEMSHOP_APP_ID env var não configurado");
    }

    const { userId, tenantId } = await requireUserAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === "generate-oauth-url") {
      const originUrl = body.origin_url || null;
      if (originUrl && !isAllowedRedirectUrl(originUrl)) {
        log.error("[nuvemshop-oauth] Blocked invalid origin_url:", originUrl);
        return new Response(JSON.stringify({ error: "Invalid origin_url" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stateValue = crypto.randomUUID();

      const { error: stateError } = await supabase.from("oauth_states").insert({
        state: stateValue,
        tenant_id: tenantId,
        user_id: userId,
        provider: "nuvemshop",
        frontend_url: originUrl || PRIMARY_FRONTEND_URL,
        redirect_path: "/integrations",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        metadata: {},
      });

      if (stateError) {
        log.error("[nuvemshop-oauth] Error persisting state:", stateError);
        return new Response(JSON.stringify({ error: "Failed to create OAuth state" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authUrl = `https://www.tiendanube.com/apps/${NUVEMSHOP_APP_ID}/authorize?state=${encodeURIComponent(stateValue)}`;

      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      // Mark the connection disconnected (token cleared) and remove the integrations row.
      const { error: connErr } = await supabase
        .from("nuvemshop_connections")
        .update({ status: "disconnected", access_token_encrypted: null })
        .eq("tenant_id", tenantId);
      if (connErr) log.error("[nuvemshop-oauth] disconnect connection error:", connErr);

      const { error: intErr } = await supabase
        .from("integrations")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("type", "nuvemshop");
      if (intErr) log.error("[nuvemshop-oauth] disconnect integration error:", intErr);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_connection") {
      const { data } = await supabase.from("nuvemshop_connections")
        .select("id, store_id, store_name, store_url, status, scope, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return new Response(JSON.stringify({ connection: data || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    log.error("[nuvemshop-oauth] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
