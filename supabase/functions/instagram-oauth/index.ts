import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { isAllowedRedirectUrl, PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

// Legacy function removed — use isAllowedRedirectUrl from frontend-config.ts

function resolveInstagramOAuthApp() {
  const metaAppId = Deno.env.get("META_APP_ID")?.trim();
  const instagramAppId = Deno.env.get("INSTAGRAM_APP_ID")?.trim();

  if (metaAppId) return { appId: metaAppId, source: "meta" as const };
  if (instagramAppId) return { appId: instagramAppId, source: "instagram" as const };

  throw new Error("Instagram app ID não configurado (META_APP_ID/INSTAGRAM_APP_ID)");
}

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-oauth", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { appId, source: appSource } = resolveInstagramOAuthApp();

    // Validate user JWT and resolve tenant
    const { userId, tenantId } = await requireUserAuth(req);

    const body = await req.json();
    const { action } = body;

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // =========================================================================
    // ACTION: generate-oauth-url
    // =========================================================================
    if (action === "generate-oauth-url") {
      const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

      // Validate origin_url against centralized allowlist
      const originUrl = body.origin_url || null;
      if (originUrl && !isAllowedRedirectUrl(originUrl)) {
        log.error("[instagram-oauth] Blocked invalid origin_url:", originUrl);
        return new Response(JSON.stringify({ error: "Invalid origin_url" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate cryptographically random state nonce
      const stateValue = crypto.randomUUID();

      // Persist state in database with 10 minute expiration (one-time use)
      const { error: stateError } = await serviceClient
        .from("oauth_states")
        .insert({
          state: stateValue,
          tenant_id: tenantId,
          user_id: userId,
          provider: "instagram",
          frontend_url: originUrl || PRIMARY_FRONTEND_URL,
          redirect_path: "/integrations",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
          metadata: { app_source: appSource },
        });

      if (stateError) {
        log.error("[instagram-oauth] Error persisting state:", stateError);
        return new Response(JSON.stringify({ error: "Failed to create OAuth state" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Instagram API scopes
      const scopes = [
        "instagram_basic",
        "instagram_manage_messages",
        "instagram_manage_comments",
        "instagram_manage_insights",
        "instagram_content_publish",
        "pages_show_list",
        "pages_manage_metadata",
        "pages_messaging",
      ].join(",");

      // state param is just the random nonce — all data is in the DB
      const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${encodeURIComponent(stateValue)}`;

      return new Response(JSON.stringify({ url: oauthUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACTION: exchange-token (deprecated — use callback flow)
    // =========================================================================
    if (action === "exchange-token") {
      return new Response(JSON.stringify({ error: "Use callback flow" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACTION: disconnect
    // =========================================================================
    if (action === "disconnect") {
      const { channel_id } = body;
      if (!channel_id) {
        return new Response(JSON.stringify({ error: "channel_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ensure channel belongs to the authenticated user's tenant
      const { data: updated, error: updateError } = await serviceClient
        .from("instagram_channels")
        .update({ status: "disconnected", access_token_encrypted: "" })
        .eq("id", channel_id)
        .eq("tenant_id", tenantId)
        .select("id")
        .maybeSingle();

      if (updateError) {
        log.error("[instagram-oauth] Disconnect error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!updated) {
        return new Response(JSON.stringify({ error: "Channel not found or not owned by your tenant" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACTION: resubscribe-webhook
    // =========================================================================
    if (action === "resubscribe-webhook") {
      const { channel_id } = body;
      if (!channel_id) {
        return new Response(JSON.stringify({ error: "channel_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: channel } = await serviceClient
        .from("instagram_channels")
        .select("id, ig_user_id, access_token_encrypted")
        .eq("id", channel_id)
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .maybeSingle();

      if (!channel) {
        return new Response(JSON.stringify({ error: "Channel not found or not connected" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { resolveInstagramAccessToken } = await import("../_shared/ig-token-resolver.ts");
      const { accessToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);

      const subFields = [
        "messages", "messaging_postbacks", "messaging_referral",
        "messaging_optins", "messaging_seen",
        "comments", "mentions", "story_insights", "follow",
      ].join(",");

      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${channel.ig_user_id}/subscribed_apps?subscribed_fields=${subFields}&access_token=${accessToken}`,
        { method: "POST" }
      );
      const subData = await subRes.json() as { success?: boolean; error?: { message: string } };

      if (subData.success) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: subData.error?.message || "Subscription failed", raw: subData }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // Auth guard throws Response objects on auth failure — pass them through
    if (error instanceof Response) return error;
    log.error("[instagram-oauth] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
