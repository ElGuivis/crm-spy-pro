import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-list-media", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const url = new URL(req.url);
    const mediaType = url.searchParams.get("type") || "all";
    const limit = Math.min(Number(url.searchParams.get("limit") || "25"), 50);
    const after = url.searchParams.get("after") || "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: channel } = await supabase
      .from("instagram_channels")
      .select("id, ig_user_id, access_token_encrypted")
      .eq("tenant_id", tenantId)
      .in("status", ["connected", "expiring"])
      .limit(1)
      .single();

    if (!channel) {
      return new Response(JSON.stringify({ error: "No connected Instagram channel" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accessToken: token, host } = await resolveInstagramAccessToken(channel.access_token_encrypted);

    const apiBase = host === "graph.instagram.com"
      ? `https://graph.instagram.com/v21.0/${channel.ig_user_id}/media`
      : `https://graph.facebook.com/v21.0/${channel.ig_user_id}/media`;

    let graphUrl = `${apiBase}?fields=id,media_type,media_url,thumbnail_url,caption,permalink,timestamp&limit=${limit}&access_token=${encodeURIComponent(token)}`;
    if (after) graphUrl += `&after=${after}`;

    log.info(`Fetching media for channel ${channel.id}, type=${mediaType}, host=${host}`);

    const resp = await fetch(graphUrl);

    if (!resp.ok) {
      const err = await resp.text();
      log.error(`Graph API error: ${err}`);
      return new Response(JSON.stringify({ error: "Failed to fetch media from Instagram" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const graphData = await resp.json();
    let media = (graphData.data || []) as Array<{
      id: string;
      media_type: string;
      media_url?: string;
      thumbnail_url?: string;
      caption?: string;
      permalink?: string;
      timestamp?: string;
    }>;

    if (mediaType === "post") {
      media = media.filter(m => m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM");
    } else if (mediaType === "reel") {
      media = media.filter(m => m.media_type === "VIDEO");
    }

    return new Response(JSON.stringify({
      media: media.map(m => ({
        id: m.id,
        media_type: m.media_type,
        thumbnail_url: m.thumbnail_url || m.media_url || null,
        caption: m.caption ? m.caption.substring(0, 120) : null,
        permalink: m.permalink,
        timestamp: m.timestamp,
      })),
      paging: graphData.paging || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});