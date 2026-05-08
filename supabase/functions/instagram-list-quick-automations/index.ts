import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id } = await req.json();

    // Get all templates
    const { data: templates, error } = await supabase
      .from("instagram_quick_automation_templates")
      .select("id, name, description, category, icon, sort_order, required_capabilities, template_nodes, template_edges, is_active")
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    // Check channel capabilities if channel_id provided
    let capabilities: string[] = [];
    if (channel_id) {
      await requireResource(supabase, "instagram_channels", channel_id, tenantId, req);
      const { data: caps } = await supabase
        .from("instagram_channel_capabilities")
        .select("capability")
        .eq("channel_id", channel_id)
        .eq("is_enabled", true);
      capabilities = (caps || []).map((c: { capability: string }) => c.capability);
    }

    // Mark each template as available or not
    const result = (templates || []).map((t: Record<string, unknown>) => ({
      ...t,
      is_available: !(t.required_capabilities as string[])?.length ||
        (t.required_capabilities as string[]).every((c: string) => capabilities.includes(c)),
      missing_capabilities: (t.required_capabilities as string[])?.filter((c: string) => !capabilities.includes(c)) || [],
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
