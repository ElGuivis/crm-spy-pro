import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-healthcheck", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUserOrInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request - can be called by cron (no auth) or by user (with auth)
    let channelId: string | null = null;
    try {
      const body = await req.json();
      channelId = body.channel_id || null;
    } catch {
      // No body = check all channels
    }

    log.info(`[healthcheck] Requested channel_id=${channelId || "<all>"} isInternal=${auth.isInternal}`);

    // Build query
    let query = serviceClient
      .from("instagram_channels")
      .select("id, ig_user_id, access_token_encrypted, status, tenant_id");

    // Scope to user's tenant when called by authenticated user
    if (!auth.isInternal && auth.tenantId) {
      query = query.eq("tenant_id", auth.tenantId);
    }

    if (channelId) {
      query = query.eq("id", channelId);
    } else {
      query = query.in("status", ["connected", "expiring", "error"]);
    }

    const { data: channels, error: fetchError } = await query;

    if (fetchError || !channels) {
      return new Response(JSON.stringify({ error: fetchError?.message || "No channels" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info(`[healthcheck] Channels found=${channels.length}`);

    const results = [];

    for (const channel of channels) {
      try {
        const { accessToken, host } = await resolveInstagramAccessToken(channel.access_token_encrypted);

        const probeUrl = host === "graph.instagram.com"
          ? `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`
          : `https://graph.facebook.com/v21.0/${channel.ig_user_id}?fields=username&access_token=${encodeURIComponent(accessToken)}`;

        const res = await fetch(probeUrl);
        const data = await res.json();

        const healthy = res.ok && !data.error;
        const newStatus = healthy ? "connected" : "error";

        await serviceClient
          .from("instagram_channels")
          .update({
            status: newStatus,
            last_healthcheck_at: new Date().toISOString(),
            ...(healthy && data.username ? { instagram_username: data.username } : {}),
          })
          .eq("id", channel.id);

        // Re-subscribe to Meta webhook events on every healthcheck (idempotent)
        // Try both: /{ig_user_id}/subscribed_apps (messaging) and /me/subscribed_apps (page-level, for comments)
        let webhookSubscribed: boolean | null = null;
        let webhookSubError: unknown = null;
        if (healthy) {
          const subFields = [
            "messages", "messaging_postbacks", "messaging_referral",
            "messaging_optins", "messaging_seen",
            "comments", "mentions", "story_insights", "follow",
          ].join(",");

          // Attempt 1: IG user subscription (requires approved permissions, may fail in dev)
          try {
            const subRes = await fetch(
              `https://graph.facebook.com/v21.0/${channel.ig_user_id}/subscribed_apps?subscribed_fields=${subFields}&access_token=${accessToken}`,
              { method: "POST" }
            );
            const subData = await subRes.json() as { success?: boolean; error?: unknown };
            if (subData.success) webhookSubscribed = true;
            else webhookSubError = subData;
          } catch (e) {
            webhookSubError = e instanceof Error ? e.message : String(e);
          }

          // Attempt 2: Page-level subscription via /me (works with page access token)
          // Only include fields valid for page-level subscriptions
          if (!webhookSubscribed) {
            try {
              const pageFields = [
                "messages", "messaging_postbacks", "messaging_referrals",
                "messaging_optins", "message_reads",
              ].join(",");
              const pageRes = await fetch(
                `https://graph.facebook.com/v21.0/me/subscribed_apps?subscribed_fields=${pageFields}&access_token=${accessToken}`,
                { method: "POST" }
              );
              const pageData = await pageRes.json() as { success?: boolean; error?: unknown };
              if (pageData.success) {
                webhookSubscribed = true;
                webhookSubError = null;
              } else {
                webhookSubError = { ig_attempt: webhookSubError, page_attempt: pageData };
              }
            } catch (e) {
              webhookSubError = { ig_attempt: webhookSubError, page_attempt: e instanceof Error ? e.message : String(e) };
            }
          }
        }

        results.push({
          channel_id: channel.id,
          ig_user_id: channel.ig_user_id,
          healthy,
          webhookSubscribed,
          webhookSubError,
          error: data.error?.message || null,
        });
      } catch (err) {
        await serviceClient
          .from("instagram_channels")
          .update({
            status: "error",
            last_healthcheck_at: new Date().toISOString(),
          })
          .eq("id", channel.id);

        results.push({
          channel_id: channel.id,
          ig_user_id: channel.ig_user_id,
          healthy: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log.error("[instagram-healthcheck] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
