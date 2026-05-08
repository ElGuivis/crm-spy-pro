import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encryptTokenAES } from "../_shared/ig-crypto.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

function normalizeAccessToken(rawInput: string): string {
  let token = rawInput.trim();

  // Accept JSON payload pasted directly from tools
  if (token.startsWith("{")) {
    try {
      const parsed = JSON.parse(token);
      if (typeof parsed?.access_token === "string") {
        token = parsed.access_token;
      }
    } catch {
      // keep original token if it's not valid JSON
    }
  }

  // Accept full URL/querystring containing access_token
  if (token.includes("access_token=")) {
    try {
      const query = token.includes("?") ? token.split("?")[1] : token;
      const params = new URLSearchParams(query);
      const extracted = params.get("access_token");
      if (extracted) token = extracted;
    } catch {
      // ignore and keep best-effort token
    }
  }

  if (token.includes("%")) {
    try {
      token = decodeURIComponent(token);
    } catch {
      // keep original token when decoding is not applicable
    }
  }

  token = token.replace(/^Bearer\s+/i, "");
  token = token.replace(/^"+|"+$/g, "");
  token = token.replace(/^'+|'+$/g, "");
  token = token.replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width chars
  token = token.replace(/\s+/g, "");
  token = token.replace(/[^A-Za-z0-9_-]/g, ""); // keep only token-safe chars

  return token;
}

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-manual-token", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET") || Deno.env.get("META_APP_SECRET") || metaAppSecret;

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rawAccessToken = typeof body?.access_token === "string" ? body.access_token : "";
    const normalizedToken = normalizeAccessToken(rawAccessToken);

    if (!normalizedToken || normalizedToken.length < 20) {
      return new Response(JSON.stringify({
        error: "access_token inválido",
        details: "Cole apenas o valor bruto do token (sem Bearer, aspas ou JSON).",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Try Instagram Graph API first (tokens starting with IGAA)
    // then fallback to Facebook Graph API
    log.info("[instagram-manual-token] Validating token...");
    const igAccounts: Array<{ igUserId: string; igUsername: string; igProfilePic: string; pageName: string }> = [];

    // Try Instagram Graph API first
    const igMeRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(normalizedToken)}`
    );
    const igMeData = await igMeRes.json();

    if (igMeData.id && !igMeData.error) {
      log.info("[instagram-manual-token] ✅ Valid Instagram API token for:", igMeData.username);
      igAccounts.push({
        igUserId: igMeData.id,
        igUsername: igMeData.username || "",
        igProfilePic: igMeData.profile_picture_url || "",
        pageName: igMeData.name || igMeData.username || "Instagram",
      });
    } else {
      // Fallback: try Facebook Graph API (Page tokens)
      log.info("[instagram-manual-token] Trying Facebook Graph API...");

      const fbUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}`;
      const fbAttempts = [
        () => fetch(`${fbUrl}&access_token=${encodeURIComponent(normalizedToken)}`),
        () => fetch(fbUrl, { headers: { Authorization: `Bearer ${normalizedToken}` } }),
        () => fetch(fbUrl, { headers: { Authorization: `OAuth ${normalizedToken}` } }),
      ];

      let pagesData: Record<string, unknown> | null = null;
      for (const attempt of fbAttempts) {
        try {
          const resp = await attempt();
          pagesData = await resp.json();
          if (!pagesData?.error || pagesData?.data) break;
        } catch {
          // try next attempt style
        }
      }

      if (!pagesData || pagesData.error) {
        log.error("[instagram-manual-token] Both APIs failed. IG:", igMeData.error, "FB:", pagesData?.error);
        return new Response(JSON.stringify({
          error: "Token inválido",
          details: `Instagram API: ${igMeData.error?.message || 'failed'}. Facebook API: ${pagesData?.error?.message || 'failed'}`,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (pagesData.data?.length > 0) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account) {
            igAccounts.push({
              igUserId: page.instagram_business_account.id,
              igUsername: page.instagram_business_account.username || "",
              igProfilePic: page.instagram_business_account.profile_picture_url || "",
              pageName: page.name || "Instagram",
            });
          }
        }
      }
    }

    if (igAccounts.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma conta Instagram Business encontrada com este token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Encrypt and save
    const encryptedToken = await encryptTokenAES(normalizedToken, encryptionKey);
    const tokenExpiresAt = new Date(Date.now() + 60 * 86400 * 1000).toISOString();
    const tokenRefreshAt = new Date(Date.now() + 53 * 86400 * 1000).toISOString();

    const savedChannels: string[] = [];

    for (const account of igAccounts) {
      const { data: channel, error: channelError } = await serviceClient
        .from("instagram_channels")
        .upsert(
          {
            tenant_id: tenantId,
            name: account.pageName,
            ig_user_id: account.igUserId,
            instagram_username: account.igUsername,
            access_token_encrypted: encryptedToken,
            token_expires_at: tokenExpiresAt,
            token_refresh_at: tokenRefreshAt,
            status: "connected",
            webhook_verified: true,
            last_sync_at: new Date().toISOString(),
            metadata: { profile_pic_url: account.igProfilePic, manual_token: true },
          },
          { onConflict: "ig_user_id" }
        )
        .select()
        .single();

      if (channelError) {
        log.error("[instagram-manual-token] Upsert error:", channelError);
        continue;
      }

      // Capabilities
      await serviceClient
        .from("instagram_channel_capabilities")
        .upsert({
          channel_id: channel.id,
          tenant_id: tenantId,
          comments: true,
          private_replies: true,
          story_reply: true,
          story_mention: true,
          live_comments: false,
          welcome_ads: false,
          ice_breakers: false,
          persistent_menu: false,
          follow_to_dm: true,
          share_to_dm: false,
          content_publish: true,
          insights: true,
          moderation: false,
          raw_capabilities: {},
        }, { onConflict: "channel_id" });

      savedChannels.push(account.igUsername || account.igUserId);
      log.info("[instagram-manual-token] ✅ Saved:", account.igUsername);
    }

    return new Response(JSON.stringify({
      success: true,
      accounts: savedChannels,
      count: savedChannels.length,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error("[instagram-manual-token] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
