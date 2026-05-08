import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-generate-deep-link", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id, channel_id, slug, ref_key, flow_id, metadata } = await req.json();
    if (!channel_id || !slug || !ref_key) throw new Error("Missing required fields");
    if (tenant_id) assertTenantMatch(authTenantId, tenant_id, req);

    // Validate channel belongs to tenant (IDOR protection)
    const channel = await requireResource<{ id: string; tenant_id: string; instagram_username: string }>(
      supabase, "instagram_channels", channel_id, authTenantId, req, "id, tenant_id, instagram_username"
    );

    const { data, error } = await supabase
      .from("instagram_deep_links")
      .upsert(
        { tenant_id: authTenantId, channel_id, slug, ref_key, flow_id, metadata: metadata || {} },
        { onConflict: "tenant_id,slug" }
      )
      .select("id, tenant_id, slug, ig_username, deep_link_url, created_at")
      .single();

    if (error) throw error;

    const igUsername = channel.instagram_username || "unknown";
    const deepLink = `https://ig.me/m/${igUsername}?ref=${ref_key}`;

    return new Response(JSON.stringify({ ok: true, deep_link: data, url: deepLink }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log.error("[generate-deep-link] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
