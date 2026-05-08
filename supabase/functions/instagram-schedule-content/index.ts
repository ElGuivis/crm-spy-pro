import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-schedule-content", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserOrInternalAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (action === "process") {
      // Process scheduled content that is due
      const { data: dueContent } = await supabase
        .from("instagram_content")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(5);

      if (!dueContent || dueContent.length === 0) {
        return new Response(JSON.stringify({ processed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      let published = 0;

      for (const item of dueContent) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/instagram-publish-content`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ content_id: item.id }),
          });
          if (resp.ok) published++;
        } catch (e) {
          log.error(`[schedule] Failed to publish ${item.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ processed: published }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Schedule content
    const { content_id, scheduled_at } = body;
    if (!content_id || !scheduled_at) throw new Error("Missing content_id or scheduled_at");

    const schedDate = new Date(scheduled_at);
    if (schedDate <= new Date()) throw new Error("scheduled_at must be in the future");

    // Verify content belongs to user's tenant
    if (!auth.isInternal) {
      const { data: contentCheck } = await supabase
        .from("instagram_content")
        .select("id")
        .eq("id", content_id)
        .eq("tenant_id", auth.tenantId)
        .maybeSingle();
      if (!contentCheck) throw new Error("Content not found or access denied");
    }

    await supabase.from("instagram_content").update({
      status: "scheduled",
      scheduled_at: schedDate.toISOString(),
    }).eq("id", content_id);

    return new Response(JSON.stringify({ ok: true, scheduled_at: schedDate.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[schedule-content] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
