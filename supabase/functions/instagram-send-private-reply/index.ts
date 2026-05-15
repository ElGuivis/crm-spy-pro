import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-send-private-reply", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Hybrid: called by user from inbox OR internally by flow-runner
    const auth = await requireUserOrInternalAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, comment_id, text, idempotency_key } = await req.json();
    if (!channel_id || !comment_id || !text) throw new Error("Missing required fields");

    // Resolve tenant — from auth for user calls, from channel lookup for internal
    let tenantId: string;
    let channelData: { access_token_encrypted: string; tenant_id: string; ig_user_id: string };

    if (!auth.isInternal) {
      // User call: validate channel belongs to tenant via requireResource (IDOR protection)
      channelData = await requireResource<{ id: string; access_token_encrypted: string; tenant_id: string; ig_user_id: string }>(
        supabase, "instagram_channels", channel_id, auth.tenantId!, req,
        "id, access_token_encrypted, tenant_id, ig_user_id"
      );
      tenantId = auth.tenantId!;
    } else {
      // Internal call: fetch channel directly (caller already verified)
      const { data: channel } = await supabase
        .from("instagram_channels")
        .select("access_token_encrypted, tenant_id, ig_user_id")
        .eq("id", channel_id)
        .single();
      if (!channel) throw new Error("Channel not found");
      channelData = channel;
      tenantId = channel.tenant_id;
    }

    // Dedup check — always, regardless of idempotency_key presence
    const { data: existing } = await supabase
      .from("instagram_comment_replies_log")
      .select("id")
      .eq("comment_id", comment_id)
      .eq("reply_type", "private")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const accessToken = await decryptToken(channelData.access_token_encrypted, encryptionKey);

    // Send private reply via Instagram API
    const resp = await fetch(
      `https://graph.instagram.com/v21.0/me/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { comment_id },
          message: { text },
        }),
      }
    );

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error?.message || "Failed to send private reply");

    // Log for dedup — ignore conflict (race condition between concurrent calls)
    await supabase.from("instagram_comment_replies_log").upsert({
      tenant_id: tenantId,
      channel_id,
      comment_id,
      reply_type: "private",
    }, { onConflict: "comment_id,reply_type", ignoreDuplicates: true });

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[send-private-reply] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...getRestrictedCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
