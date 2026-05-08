import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource, requireResources } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-upsert-welcome-ad-flow", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { id, tenant_id, channel_id, name, campaign_id, adset_id, ad_id, flow_id, is_active } = await req.json();
    assertTenantMatch(authTenantId, tenant_id, req);
    if (!channel_id || !name) throw new Error("Missing required fields");

    // Validate all referenced resources belong to tenant
    await requireResources(supabase, [
      { table: "instagram_channels", id: channel_id },
      ...(flow_id ? [{ table: "instagram_flows" as const, id: flow_id }] : []),
    ], authTenantId, req);


    if (id) {
      // Update
      const { data, error } = await supabase
        .from("instagram_ad_welcome_flows")
        .update({ name, campaign_id, adset_id, ad_id, flow_id, is_active })
        .eq("id", id)
        .select("id, tenant_id, channel_id, name, campaign_id, adset_id, ad_id, flow_id, is_active, created_at, updated_at")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Insert
      const { data, error } = await supabase
        .from("instagram_ad_welcome_flows")
        .insert({ tenant_id, channel_id, name, campaign_id, adset_id, ad_id, flow_id, is_active: is_active ?? true })
        .select("id, tenant_id, channel_id, name, campaign_id, adset_id, ad_id, flow_id, is_active, created_at, updated_at")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[upsert-welcome-ad-flow] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
