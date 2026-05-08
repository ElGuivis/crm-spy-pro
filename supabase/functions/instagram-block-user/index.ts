import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResources } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-block-user", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, contact_id, reason, user_id } = await req.json();
    if (!channel_id || !contact_id) throw new Error("Missing required fields");

    // Validate both resources belong to tenant (IDOR protection)
    await requireResources(supabase, [
      { table: "instagram_channels", id: channel_id },
      { table: "instagram_contacts", id: contact_id },
    ], tenantId, req);

    const { data: contact } = await supabase
      .from("instagram_contacts")
      .select("igsid, instagram_username")
      .eq("id", contact_id)
      .eq("tenant_id", tenantId)
      .single();

    // Record block
    await supabase.from("instagram_blocked_users").upsert({
      tenant_id: tenantId,
      channel_id,
      contact_id,
      igsid: contact?.igsid,
      username: contact?.instagram_username,
      blocked_by: user_id || null,
      reason: reason || null,
      is_active: true,
      blocked_at: new Date().toISOString(),
      unblocked_at: null,
    }, { onConflict: "channel_id,contact_id,is_active" });

    // Mark contact as blocked — scoped to tenant
    await supabase
      .from("instagram_contacts")
      .update({ is_blocked: true })
      .eq("id", contact_id)
      .eq("tenant_id", tenantId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[block-user] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
