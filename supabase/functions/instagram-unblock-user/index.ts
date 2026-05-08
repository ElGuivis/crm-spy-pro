import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResources } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("ig-unblock-user", cid);

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, contact_id } = await req.json();
    if (!channel_id || !contact_id) throw new Error("Missing required fields");

    await requireResources(supabase, [
      { table: "instagram_channels", id: channel_id },
      { table: "instagram_contacts", id: contact_id },
    ], tenantId, req);

    await supabase
      .from("instagram_blocked_users")
      .update({ is_active: false, unblocked_at: new Date().toISOString() })
      .eq("channel_id", channel_id)
      .eq("contact_id", contact_id)
      .eq("is_active", true);

    await supabase
      .from("instagram_contacts")
      .update({ is_blocked: false })
      .eq("id", contact_id)
      .eq("tenant_id", tenantId);

    log.info("User unblocked", { channelId: channel_id, contactId: contact_id });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
