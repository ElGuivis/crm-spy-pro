import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-track-cta-click", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { cta_link_id, tenant_id, contact_id, thread_id, message_id } = await req.json();
    if (!cta_link_id || !tenant_id) throw new Error("cta_link_id and tenant_id required");

    // Verify CTA link belongs to tenant
    const { data: ctaLink } = await supabase
      .from("instagram_cta_links")
      .select("id")
      .eq("id", cta_link_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (!ctaLink) throw new Error("CTA link not found for this tenant");

    // Record click event
    await supabase.from("instagram_cta_link_clicks").insert({
      tenant_id, cta_link_id, contact_id, thread_id, message_id,
    });

    // Atomic increment via RPC (no race condition)
    await supabase.rpc("increment_cta_click_count", { p_cta_link_id: cta_link_id });

    // Mark message as tracked if message_id provided
    if (message_id) {
      await supabase
        .from("instagram_messages")
        .update({ cta_click_tracked: true })
        .eq("id", message_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[track-cta-click]", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
