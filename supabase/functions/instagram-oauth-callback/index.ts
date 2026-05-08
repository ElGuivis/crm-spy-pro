import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encryptTokenAES } from "../_shared/ig-crypto.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { isAllowedRedirectUrl, PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

type AppSource = "meta" | "instagram";

function resolveInstagramOAuthCredentials(preferredSource?: AppSource) {
  const metaAppId = Deno.env.get("META_APP_ID")?.trim();
  const metaAppSecret = Deno.env.get("META_APP_SECRET")?.trim();
  const instagramAppId = Deno.env.get("INSTAGRAM_APP_ID")?.trim();
  const instagramAppSecret = Deno.env.get("INSTAGRAM_APP_SECRET")?.trim();

  const prioritized = preferredSource === "instagram"
    ? [
        { source: "instagram" as const, appId: instagramAppId, appSecret: instagramAppSecret },
        { source: "meta" as const, appId: metaAppId, appSecret: metaAppSecret },
      ]
    : [
        { source: "meta" as const, appId: metaAppId, appSecret: metaAppSecret },
        { source: "instagram" as const, appId: instagramAppId, appSecret: instagramAppSecret },
      ];

  const selected = prioritized.find((c) => c.appId && c.appSecret);
  if (!selected) {
    throw new Error("Credenciais OAuth do Instagram não configuradas (META_* ou INSTAGRAM_*)");
  }
  return { appId: selected.appId as string, appSecret: selected.appSecret as string, source: selected.source };
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-oauth-callback", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const defaultFrontendUrl = PRIMARY_FRONTEND_URL;

  // Handle GET (OAuth redirect from Meta)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorReason = url.searchParams.get("error_reason");

    let frontendUrl = defaultFrontendUrl;

    if (error) {
      log.error("[instagram-oauth-callback] OAuth error:", error, errorReason);
      return new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}/integrations?ig_error=${encodeURIComponent(error)}` },
      });
    }

    if (!code || !stateParam) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}/integrations?ig_error=missing_params` },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      // =====================================================================
      // Step 0: Validate state from database (anti-CSRF, one-time use)
      // =====================================================================
      const { data: stateData, error: stateError } = await serviceClient
        .from("oauth_states")
        .select("id, state, provider, user_id, tenant_id, frontend_url, redirect_path, expires_at, metadata")
        .eq("state", stateParam)
        .eq("provider", "instagram")
        .single();

      if (stateError || !stateData) {
        log.error("[instagram-oauth-callback] Invalid state:", stateParam);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=invalid_state` },
        });
      }

      // Check expiration
      if (new Date(stateData.expires_at) < new Date()) {
        await serviceClient.from("oauth_states").delete().eq("id", stateData.id);
        log.error("[instagram-oauth-callback] State expired:", stateData.id);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=state_expired` },
        });
      }

      // Delete immediately (one-time use — prevents replay attacks)
      await serviceClient.from("oauth_states").delete().eq("id", stateData.id);

      const tenant_id = stateData.tenant_id;
      const app_source = stateData.metadata?.app_source as AppSource | undefined;

      // Use frontend_url from state record (validated at generation time)
      if (stateData.frontend_url && isAllowedRedirectUrl(stateData.frontend_url)) {
        frontendUrl = stateData.frontend_url;
      }

      // =====================================================================
      // Step 1: Resolve credentials & exchange code for token
      // =====================================================================
      const { appId: metaAppId, appSecret: metaAppSecret, source: appSource } =
        resolveInstagramOAuthCredentials(app_source);
      log.info(`[instagram-oauth-callback] Using app source: ${appSource}`);

      const encryptionKey =
        Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") ||
        Deno.env.get("INSTAGRAM_APP_SECRET") ||
        Deno.env.get("META_APP_SECRET") ||
        metaAppSecret;

      const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

      // Exchange code for short-lived USER token
      log.info("[instagram-oauth-callback] Exchanging code for token...");
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${metaAppSecret}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        log.error("[instagram-oauth-callback] Token exchange error:", tokenData.error);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=token_exchange_failed` },
        });
      }

      const shortLivedUserToken = tokenData.access_token;

      // =====================================================================
      // Step 2: Exchange for long-lived USER token
      // =====================================================================
      log.info("[instagram-oauth-callback] Exchanging for long-lived user token...");
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${shortLivedUserToken}`;
      const longLivedRes = await fetch(longLivedUrl);
      const longLivedData = await longLivedRes.json();

      if (longLivedData.error) {
        log.error("[instagram-oauth-callback] Long-lived token error:", longLivedData.error);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=long_lived_token_failed` },
        });
      }

      const longLivedUserToken = longLivedData.access_token;

      // =====================================================================
      // Step 3: Get Pages + Instagram Business Accounts
      // =====================================================================
      log.info("[instagram-oauth-callback] Fetching pages with page tokens...");
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${longLivedUserToken}`
      );
      const pagesData = await pagesRes.json();

      const igAccounts: Array<{
        igUserId: string;
        igUsername: string;
        igProfilePic: string;
        pageName: string;
        pageAccessToken: string;
      }> = [];

      if (pagesData.data && pagesData.data.length > 0) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account && page.access_token) {
            igAccounts.push({
              igUserId: page.instagram_business_account.id,
              igUsername: page.instagram_business_account.username || "",
              igProfilePic: page.instagram_business_account.profile_picture_url || "",
              pageName: page.name || "Instagram",
              pageAccessToken: page.access_token,
            });
            log.info(
              `[instagram-oauth-callback] Found page "${page.name}" with IG account @${page.instagram_business_account.username}`
            );
          }
        }
      }

      // Fallback: direct Instagram API for creator accounts
      if (igAccounts.length === 0) {
        log.info("[instagram-oauth-callback] No pages found, trying direct Instagram API...");
        const igMeRes = await fetch(
          `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${longLivedUserToken}`
        );
        const igMeData = await igMeRes.json();
        if (igMeData.id) {
          igAccounts.push({
            igUserId: igMeData.id,
            igUsername: igMeData.username || "",
            igProfilePic: "",
            pageName: igMeData.username || "Instagram",
            pageAccessToken: longLivedUserToken,
          });
        }
      }

      if (igAccounts.length === 0) {
        log.error("[instagram-oauth-callback] No Instagram account found");
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=no_instagram_account` },
        });
      }

      // =====================================================================
      // Step 4: Save accounts with PAGE ACCESS TOKENS
      // =====================================================================
      const savedChannelIds: string[] = [];

      for (const account of igAccounts) {
        const encryptedToken = await encryptTokenAES(account.pageAccessToken, encryptionKey);
        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        const tokenRefreshAt = new Date(Date.now() + 83 * 24 * 60 * 60 * 1000).toISOString();

        const { data: channel, error: channelError } = await serviceClient
          .from("instagram_channels")
          .upsert(
            {
              tenant_id,
              name: account.pageName,
              ig_user_id: account.igUserId,
              instagram_username: account.igUsername,
              access_token_encrypted: encryptedToken,
              token_expires_at: tokenExpiresAt,
              token_refresh_at: tokenRefreshAt,
              status: "connected",
              last_sync_at: new Date().toISOString(),
              metadata: { profile_pic_url: account.igProfilePic },
            },
            { onConflict: "ig_user_id" }
          )
          .select()
          .single();

        if (channelError) {
          log.error("[instagram-oauth-callback] Channel upsert error:", account.igUsername, channelError);
          continue;
        }

        savedChannelIds.push(channel.id);

        await serviceClient
          .from("instagram_channel_capabilities")
          .upsert(
            {
              channel_id: channel.id,
              tenant_id,
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
            },
            { onConflict: "channel_id" }
          );

        log.info(`[instagram-oauth-callback] ✅ Instagram connected: @${account.igUsername}`);
      }

      if (savedChannelIds.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/integrations?ig_error=save_failed` },
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${frontendUrl}/integrations?ig_success=true&channels=${savedChannelIds.length}`,
        },
      });
    } catch (err) {
      log.error("[instagram-oauth-callback] Unexpected error:", err);
      return new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}/integrations?ig_error=unexpected` },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
