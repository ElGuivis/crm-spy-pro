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

    const body = await req.json();
    const { contact_id, channel_id } = body;
    if (!contact_id || !channel_id) throw new Error("contact_id and channel_id required");

    await requireResource(supabase, "instagram_channels", channel_id, tenantId, req);

    // Remove all pauses
    const { error } = await supabase
      .from("instagram_contact_pauses")
      .delete()
      .eq("contact_id", contact_id)
      .eq("channel_id", channel_id);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
