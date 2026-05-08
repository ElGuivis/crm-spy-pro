import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-hide-comment", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, comment_id, hide } = await req.json();
    if (!channel_id || !comment_id) throw new Error("Missing required fields");

    const channel = await requireResource<{ id: string; tenant_id: string; access_token_encrypted: string }>(
      supabase, "instagram_channels", channel_id, tenantId, req,
      "id, tenant_id, access_token_encrypted"
    );

    const shouldHide = hide !== false;
    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const accessToken = await decryptToken(channel.access_token_encrypted, encryptionKey);

    const resp = await fetch(
      `https://graph.instagram.com/v21.0/${comment_id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ hide: shouldHide }),
      }
    );

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error?.message || "Failed to hide/unhide comment");

    await supabase
      .from("instagram_comment_queue")
      .update({
        is_hidden: shouldHide,
        moderation_status: shouldHide ? "hidden" : "approved",
        moderated_at: new Date().toISOString(),
      })
      .eq("ig_comment_id", comment_id)
      .eq("tenant_id", tenantId);

    return new Response(JSON.stringify({ ok: true, hidden: shouldHide }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[hide-comment] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
