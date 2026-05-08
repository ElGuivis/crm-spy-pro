import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES, encryptTokenAES } from "../_shared/ig-crypto.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-refresh-token", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || metaAppSecret;

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find channels that need token refresh (within 7 days of expiry)
    const { data: channels, error: fetchError } = await serviceClient
      .from("instagram_channels")
      .select("id, ig_user_id, access_token_encrypted, token_expires_at, status")
      .in("status", ["connected", "expiring"])
      .lte("token_refresh_at", new Date().toISOString());

    if (fetchError) {
      log.error("[instagram-refresh-token] Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!channels || channels.length === 0) {
      log.info("[instagram-refresh-token] No channels need refresh");
      return new Response(JSON.stringify({ refreshed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let refreshed = 0;
    let errors = 0;

    for (const channel of channels) {
      try {
        const currentToken = await decryptTokenAES(channel.access_token_encrypted, encryptionKey);

        // Refresh via Instagram API
        const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`;
        const refreshRes = await fetch(refreshUrl);
        const refreshData = await refreshRes.json();

        if (refreshData.error) {
          log.error(`[instagram-refresh-token] Refresh failed for ${channel.ig_user_id}:`, refreshData.error);
          
          // Mark as expiring or expired
          const now = new Date();
          const expiresAt = new Date(channel.token_expires_at);
          const newStatus = expiresAt <= now ? "expired" : "expiring";
          
          await serviceClient
            .from("instagram_channels")
            .update({ status: newStatus })
            .eq("id", channel.id);

          errors++;
          continue;
        }

        const newToken = refreshData.access_token;
        const expiresIn = refreshData.expires_in || 5184000;
        const encryptedToken = await encryptTokenAES(newToken, encryptionKey);
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        const tokenRefreshAt = new Date(Date.now() + (expiresIn - 86400 * 7) * 1000).toISOString();

        await serviceClient
          .from("instagram_channels")
          .update({
            access_token_encrypted: encryptedToken,
            token_expires_at: tokenExpiresAt,
            token_refresh_at: tokenRefreshAt,
            status: "connected",
          })
          .eq("id", channel.id);

        log.info(`[instagram-refresh-token] ✅ Refreshed token for ${channel.ig_user_id}`);
        refreshed++;
      } catch (err) {
        log.error(`[instagram-refresh-token] Error refreshing ${channel.ig_user_id}:`, err);
        errors++;
      }
    }

    return new Response(JSON.stringify({ refreshed, errors, total: channels.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log.error("[instagram-refresh-token] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
