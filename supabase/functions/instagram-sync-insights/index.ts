import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-sync-insights", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { channel_id } = body;
    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;

    // Get channels to sync
    let channelsQuery = supabase
      .from("instagram_channels")
      .select("id, tenant_id, access_token_encrypted, ig_user_id")
      .in("status", ["connected", "expiring"]);

    if (channel_id) channelsQuery = channelsQuery.eq("id", channel_id);

    const { data: channels } = await channelsQuery.limit(10);
    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalMedia = 0, totalChannel = 0;

    for (const ch of channels) {
      try {
        const token = await decryptToken(ch.access_token_encrypted, encryptionKey);
        const igUserId = ch.ig_user_id;

        // Sync channel-level insights
        try {
          const profileResp = await fetch(
            `https://graph.instagram.com/v21.0/${igUserId}?fields=followers_count,follows_count,media_count`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const profile = await profileResp.json();

          const insightsResp = await fetch(
            `https://graph.instagram.com/v21.0/${igUserId}/insights?metric=impressions,reach,profile_views,website_clicks&period=day&since=${Math.floor(Date.now()/1000) - 86400}&until=${Math.floor(Date.now()/1000)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const insightsData = await insightsResp.json();

          const metrics: Record<string, unknown> = {};
          for (const m of (insightsData.data || [])) {
            const val = m.values?.[0]?.value || 0;
            metrics[m.name] = val;
          }

          const today = new Date().toISOString().split("T")[0];
          await supabase.from("instagram_channel_insights").upsert({
            tenant_id: ch.tenant_id,
            channel_id: ch.id,
            insight_date: today,
            followers_count: profile.followers_count,
            follows_count: profile.follows_count,
            media_count: profile.media_count,
            impressions: metrics.impressions || 0,
            reach: metrics.reach || 0,
            profile_views: metrics.profile_views || 0,
            website_clicks: metrics.website_clicks || 0,
            insights_raw: insightsData,
            synced_at: new Date().toISOString(),
          }, { onConflict: "channel_id,insight_date" });

          totalChannel++;
        } catch (e) {
          log.error(`[sync-insights] Channel insights error for ${ch.id}:`, e);
        }

        // Sync recent media insights
        try {
          const mediaResp = await fetch(
            `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,media_type,permalink,caption,timestamp&limit=25`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const mediaData = await mediaResp.json();

          for (const media of (mediaData.data || [])) {
            try {
              const metricsFields = media.media_type === "VIDEO"
                ? "impressions,reach,likes,comments,saved,shares,plays"
                : "impressions,reach,likes,comments,saved,shares";

              const mInsightsResp = await fetch(
                `https://graph.instagram.com/v21.0/${media.id}/insights?metric=${metricsFields}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const mInsights = await mInsightsResp.json();

              const vals: Record<string, unknown> = {};
              for (const m of (mInsights.data || [])) {
                vals[m.name] = m.values?.[0]?.value || 0;
              }

              const { count: dmCount } = await supabase
                .from("instagram_threads")
                .select("id", { count: "exact", head: true })
                .eq("channel_id", ch.id)
                .eq("entrypoint_ref", media.id);

              await supabase.from("instagram_media_insights").upsert({
                tenant_id: ch.tenant_id,
                channel_id: ch.id,
                ig_media_id: media.id,
                media_type: media.media_type,
                permalink: media.permalink,
                caption: media.caption,
                timestamp: media.timestamp,
                impressions: vals.impressions || 0,
                reach: vals.reach || 0,
                likes: vals.likes || 0,
                comments: vals.comments || 0,
                saves: vals.saved || 0,
                shares: vals.shares || 0,
                plays: vals.plays || 0,
                dm_threads_generated: dmCount || 0,
                insights_raw: mInsights,
                synced_at: new Date().toISOString(),
              }, { onConflict: "channel_id,ig_media_id" });

              totalMedia++;
            } catch { /* skip individual media errors */ }
          }
        } catch (e) {
          log.error(`[sync-insights] Media insights error for ${ch.id}:`, e);
        }
      } catch (e) {
        log.error(`[sync-insights] Channel error:`, e);
      }
    }

    log.info(`[sync-insights] Synced ${totalChannel} channels, ${totalMedia} media`);
    return new Response(JSON.stringify({ channels: totalChannel, media: totalMedia }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[sync-insights] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
