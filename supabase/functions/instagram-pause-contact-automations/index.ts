import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { contact_id, channel_id, duration, reason, paused_by } = await req.json();
    if (!contact_id || !channel_id) throw new Error("Missing required fields");

    await requireResource(supabase, "instagram_channels", channel_id, tenantId, req);

    // Calculate paused_until
    let pausedUntil: string | null = null;
    const durationMap: Record<string, number> = {
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "3h": 3 * 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "12h": 12 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };

    if (duration && duration !== "indefinite" && durationMap[duration]) {
      pausedUntil = new Date(Date.now() + durationMap[duration]).toISOString();
    }

    // Remove existing pauses for this contact+channel
    await supabase
      .from("instagram_contact_pauses")
      .delete()
      .eq("contact_id", contact_id)
      .eq("channel_id", channel_id);

    // Create new pause
    const { error } = await supabase.from("instagram_contact_pauses").insert({
      tenant_id: tenantId,
      contact_id,
      channel_id,
      paused_until: pausedUntil,
      reason: reason || "Manual pause",
      source: "manual",
      paused_by,
    });
    if (error) throw error;

    // Cancel active runs for this contact
    await supabase
      .from("instagram_flow_runs")
      .update({ status: "cancelled", completed_at: new Date().toISOString(), paused_by_contact_rule: true })
      .eq("contact_id", contact_id)
      .in("status", ["running", "waiting"]);

    return new Response(JSON.stringify({ ok: true, paused_until: pausedUntil }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
