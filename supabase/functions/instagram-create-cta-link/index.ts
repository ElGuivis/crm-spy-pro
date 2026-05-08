import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { tenant_id, channel_id, label, url, utm_source, utm_medium, utm_campaign, utm_content, ref_key, flow_id, version_id, node_id } = await req.json();
    if (!channel_id || !label || !url) throw new Error("Missing required fields");
    if (tenant_id) assertTenantMatch(authTenantId, tenant_id, req);

    // Validate channel ownership via requireResource
    await requireResource(supabase, "instagram_channels", channel_id, authTenantId, req);

    // Build tracked URL with UTMs
    const urlObj = new URL(url);
    if (utm_source) urlObj.searchParams.set("utm_source", utm_source);
    if (utm_medium) urlObj.searchParams.set("utm_medium", utm_medium);
    if (utm_campaign) urlObj.searchParams.set("utm_campaign", utm_campaign);
    if (utm_content) urlObj.searchParams.set("utm_content", utm_content);
    if (ref_key) urlObj.searchParams.set("ref", ref_key);

    const { data, error } = await supabase
      .from("instagram_cta_links")
      .insert({
        tenant_id: authTenantId, channel_id, label, url: urlObj.toString(),
        utm_source, utm_medium, utm_campaign, utm_content, ref_key,
        flow_id, version_id, node_id,
      })
      .select("id, tenant_id, channel_id, slug, destination_url, utm_source, utm_medium, utm_campaign, utm_content, click_count, flow_id, version_id, node_id, created_at")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
