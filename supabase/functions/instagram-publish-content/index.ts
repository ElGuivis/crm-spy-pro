import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireUserOrInternalAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-publish-content", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { content_id } = await req.json();
    if (!content_id) throw new Error("Missing content_id");


    const { data: content, error: contentError } = await supabase
      .from("instagram_content")
      .select("*, channel:instagram_channels(access_token_encrypted, ig_user_id)")
      .eq("id", content_id)
      .single();
    if (contentError) {
      log.error("[publish-content] Query error:", contentError);
      throw new Error(`Content query failed: ${contentError.message}`);
    }
    if (!content) throw new Error("Content not found");

    // Tenant scope check
    if (!auth.isInternal && content.tenant_id) {
      assertTenantMatch(auth.tenantId!, content.tenant_id, req);
    }

    const channel = content.channel as Record<string, unknown>;
    if (!channel?.access_token_encrypted) throw new Error("Channel not connected");

    let accessToken: string | null = null;
    let baseGraphHost: "graph.instagram.com" | "graph.facebook.com" = "graph.instagram.com";

    try {
      const resolved = await resolveInstagramAccessToken(channel.access_token_encrypted);
      accessToken = resolved.accessToken;
      baseGraphHost = resolved.host;
    } catch (err) {
      log.error("[publish-content] Token resolve failed", err);
      throw new Error("Token do Instagram inválido ou incompatível. Reconecte a conta do Instagram.");
    }

    if (!accessToken) {
      throw new Error("Token do Instagram inválido ou incompatível. Reconecte a conta do Instagram.");
    }

    const igUserId = channel.ig_user_id;

    await supabase.from("instagram_content").update({ status: "publishing" }).eq("id", content_id);

    let containerId: string;

    if (content.content_type === "carousel") {
      const itemIds: string[] = [];
      for (const url of (content.media_urls || [])) {
        const isVideo = /\.(mp4|mov)$/i.test(url);
        const itemResp = await fetch(`https://${baseGraphHost}/v21.0/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            ...(isVideo ? { video_url: url, media_type: "VIDEO" } : { image_url: url }),
            is_carousel_item: true,
          }),
        });
        const itemResult = await itemResp.json();
        if (!itemResp.ok) throw new Error(itemResult.error?.message || "Failed to create carousel item");
        itemIds.push(itemResult.id);
      }

      const carouselResp = await fetch(`https://${baseGraphHost}/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: itemIds,
          caption: content.caption || "",
        }),
      });
      const carouselResult = await carouselResp.json();
      if (!carouselResp.ok) throw new Error(carouselResult.error?.message || "Failed to create carousel");
      containerId = carouselResult.id;
    } else {
      const mediaUrl = content.media_urls?.[0];
      if (!mediaUrl) throw new Error("No media URL provided");

      const isVideo = content.content_type === "video" || content.content_type === "reel";
      const body: Record<string, string> = { caption: content.caption || "" };

      if (content.content_type === "reel") {
        body.media_type = "REELS";
        body.video_url = mediaUrl;
        if (content.cover_url) body.cover_url = content.cover_url;
      } else if (isVideo) {
        body.media_type = "VIDEO";
        body.video_url = mediaUrl;
      } else {
        body.image_url = mediaUrl;
      }

      const createResp = await fetch(`https://${baseGraphHost}/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const createResult = await createResp.json();
      if (!createResp.ok) throw new Error(createResult.error?.message || "Failed to create media container");
      containerId = createResult.id;
    }

    // Wait for container to be ready (all types need polling)
    {
      let ready = false;
      const maxAttempts = content.content_type === "image" ? 10 : 30;
      const delayMs = content.content_type === "image" ? 2000 : 5000;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, delayMs));
        const statusResp = await fetch(
          `https://${baseGraphHost}/v21.0/${containerId}?fields=status_code,status`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const statusResult = await statusResp.json();
        log.info(`[publish-content] Poll ${i+1}: status_code=${statusResult.status_code}, status=${statusResult.status}`);
        if (statusResult.status_code === "FINISHED") { ready = true; break; }
        if (statusResult.status_code === "ERROR") {
          throw new Error(`Media processing failed: ${statusResult.status || "unknown error"}`);
        }
      }
      if (!ready) throw new Error("Media processing timed out");
    }

    // Publish
    const publishResp = await fetch(`https://${baseGraphHost}/v21.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ creation_id: containerId }),
    });
    const publishResult = await publishResp.json();
    if (!publishResp.ok) throw new Error(publishResult.error?.message || "Failed to publish");

    // Get permalink
    let permalink = "";
    try {
      const mediaResp = await fetch(
        `https://${baseGraphHost}/v21.0/${publishResult.id}?fields=permalink`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const mediaData = await mediaResp.json();
      permalink = mediaData.permalink || "";
    } catch { /* optional */ }

    await supabase.from("instagram_content").update({
      status: "published",
      published_at: new Date().toISOString(),
      ig_media_id: publishResult.id,
      ig_permalink: permalink,
    }).eq("id", content_id);

    return new Response(JSON.stringify({ ok: true, ig_media_id: publishResult.id, permalink }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[publish-content] Error:", err);

    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { content_id } = await req.clone().json().catch(() => ({}));
      if (content_id) {
        await supabase.from("instagram_content").update({
          status: "failed", error_message: err.message,
        }).eq("id", content_id);
      }
    } catch { /* best effort */ }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
