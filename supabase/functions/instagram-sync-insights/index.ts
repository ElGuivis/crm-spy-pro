import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";

const API_VERSION = "v21.0";
const API_HOST = "graph.facebook.com";

async function callMeta(path: string, token: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://${API_HOST}/${API_VERSION}${path}${sep}access_token=${token}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data?.error) {
    throw new Error(`Meta API: ${data.error.message} (code ${data.error.code}, type ${data.error.type})`);
  }
  return data;
}

async function syncChannel(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; tenant_id: string; ig_user_id: string; access_token_encrypted: string },
  log: ReturnType<typeof createLogger>,
): Promise<{ channelDays: number; mediaSynced: number }> {
  const { accessToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);

  // ── 1. Account basics ────────────────────────────────────────────────────────
  const basic = await callMeta(
    `/${channel.ig_user_id}?fields=followers_count,follows_count,media_count`,
    accessToken,
  ) as { followers_count?: number; follows_count?: number; media_count?: number };

  // ── 2. Daily account insights — last 7 days ──────────────────────────────────
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const until = Math.floor(Date.now() / 1000) + 86400; // +1d so today is included
  const metricNames = [
    "impressions", "reach", "profile_views",
    "website_clicks", "email_contacts", "phone_call_clicks",
  ];

  const byDate: Record<string, Record<string, number>> = {};
  try {
    const insightsResp = await callMeta(
      `/${channel.ig_user_id}/insights?metric=${metricNames.join(",")}&period=day&since=${since}&until=${until}`,
      accessToken,
    ) as { data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }> };

    for (const metric of (insightsResp.data || [])) {
      for (const val of metric.values) {
        const date = val.end_time.split("T")[0];
        if (!byDate[date]) byDate[date] = {};
        byDate[date][metric.name] = val.value;
      }
    }
  } catch (e) {
    log.warn(`[sync-insights] Account insights failed for ${channel.id}:`, e);
  }

  const today = new Date().toISOString().split("T")[0];

  // Ensure today always has an entry with account basics
  if (!byDate[today]) byDate[today] = {};

  let channelDays = 0;
  for (const [date, values] of Object.entries(byDate)) {
    if (date > today) continue;
    const isToday = date === today;
    const { error } = await supabase.from("instagram_channel_insights").upsert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      insight_date: date,
      followers_count: isToday ? (basic.followers_count ?? null) : null,
      follows_count: isToday ? (basic.follows_count ?? null) : null,
      media_count: isToday ? (basic.media_count ?? null) : null,
      impressions: values.impressions ?? 0,
      reach: values.reach ?? 0,
      profile_views: values.profile_views ?? 0,
      website_clicks: values.website_clicks ?? 0,
      email_contacts: values.email_contacts ?? 0,
      phone_call_clicks: values.phone_call_clicks ?? 0,
      insights_raw: values,
      synced_at: new Date().toISOString(),
    }, { onConflict: "channel_id,insight_date" });
    if (!error) channelDays++;
    else log.warn(`[sync-insights] Upsert channel insights error (${date}):`, error);
  }

  // ── 3. Media insights — last 30 posts ────────────────────────────────────────
  let mediaSynced = 0;
  try {
    const mediaResp = await callMeta(
      `/${channel.ig_user_id}/media?fields=id,media_type,permalink,caption,timestamp,like_count,comments_count&limit=30`,
      accessToken,
    ) as { data: Array<{ id: string; media_type: string; permalink?: string; caption?: string; timestamp: string; like_count?: number; comments_count?: number }> };

    for (const media of (mediaResp.data || [])) {
      // Insights only available after 24h
      if (Date.now() - new Date(media.timestamp).getTime() < 24 * 3600 * 1000) continue;

      try {
        const isVideo = media.media_type === "VIDEO" || media.media_type === "REEL";
        const mediaMetrics = isVideo
          ? "impressions,reach,saved,shares,plays,video_views"
          : "impressions,reach,saved,shares";

        const miResp = await callMeta(
          `/${media.id}/insights?metric=${mediaMetrics}`,
          accessToken,
        ) as { data: Array<{ name: string; values: Array<{ value: number }> }> };

        const flat: Record<string, number> = {};
        for (const m of (miResp.data || [])) {
          flat[m.name] = m.values?.[0]?.value ?? 0;
        }

        const { error } = await supabase.from("instagram_media_insights").upsert({
          tenant_id: channel.tenant_id,
          channel_id: channel.id,
          ig_media_id: media.id,
          media_type: media.media_type,
          permalink: media.permalink ?? null,
          caption: media.caption?.substring(0, 500) ?? null,
          timestamp: media.timestamp,
          impressions: flat.impressions ?? 0,
          reach: flat.reach ?? 0,
          likes: media.like_count ?? 0,
          comments: media.comments_count ?? 0,
          saves: flat.saved ?? 0,
          shares: flat.shares ?? 0,
          plays: flat.plays ?? flat.video_views ?? 0,
          insights_raw: flat,
          synced_at: new Date().toISOString(),
        }, { onConflict: "channel_id,ig_media_id" });

        if (!error) mediaSynced++;
        else log.warn(`[sync-insights] Media upsert error (${media.id}):`, error);
      } catch (e) {
        log.warn(`[sync-insights] Media insights failed for ${media.id}:`, e);
      }
    }
  } catch (e) {
    log.warn(`[sync-insights] Media list failed for channel ${channel.id}:`, e);
  }

  return { channelDays, mediaSynced };
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-sync-insights", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const specificChannelId: string | null = body.channel_id ?? null;

    let query = supabase
      .from("instagram_channels")
      .select("id, tenant_id, ig_user_id, access_token_encrypted")
      .in("status", ["connected", "expiring"]);

    if (specificChannelId) query = query.eq("id", specificChannelId);

    const { data: channels, error: channelsError } = await query;
    if (channelsError) throw channelsError;

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ synced: 0, channels: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDays = 0, totalMedia = 0;

    for (const ch of channels) {
      try {
        const { channelDays, mediaSynced } = await syncChannel(supabase, ch, log);
        totalDays += channelDays;
        totalMedia += mediaSynced;
        log.info(`[sync-insights] ✅ ${ch.id}: ${channelDays} days, ${mediaSynced} media`);
      } catch (e) {
        log.error(`[sync-insights] Channel ${ch.id} failed:`, e);
      }
    }

    return new Response(
      JSON.stringify({ channels: channels.length, channelDays: totalDays, media: totalMedia }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[sync-insights] Fatal:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
