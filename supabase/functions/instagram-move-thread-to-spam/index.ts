import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-move-thread-to-spam", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { thread_id, is_spam, user_id } = await req.json();
    if (!thread_id) throw new Error("Missing thread_id");

    // Validate thread belongs to tenant (IDOR protection)
    const thread = await requireResource<{ id: string; tenant_id: string; channel_id: string }>(
      supabase, "instagram_threads", thread_id, tenantId, req, "id, tenant_id, channel_id"
    );

    // Also validate channel ownership
    await requireResource(supabase, "instagram_channels", thread.channel_id, tenantId, req);

    const markAsSpam = is_spam !== false;

    await supabase
      .from("instagram_threads")
      .update({
        is_spam: markAsSpam,
        spam_marked_at: markAsSpam ? new Date().toISOString() : null,
        spam_marked_by: markAsSpam ? (user_id || null) : null,
        thread_status: markAsSpam ? "closed" : "open",
      })
      .eq("id", thread_id);

    return new Response(JSON.stringify({ ok: true, is_spam: markAsSpam }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log.error("[move-to-spam] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
