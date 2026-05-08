import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);


  const cid = getCorrelationId(req);
  const log = createLogger("ai-default-provider", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "get") {
      const { data } = await supabase
        .from("tenant_ai_credentials")
        .select("provider")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .maybeSingle();

      return new Response(
        JSON.stringify({ provider: data?.provider || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "set") {
      const provider = body.provider;
      if (!provider || typeof provider !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing provider" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Require admin role
      const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
        _user_id: userId,
        _tenant_id: tenantId,
      });

      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden: admin only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify provider exists for this tenant
      const { data: cred } = await supabase
        .from("tenant_ai_credentials")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle();

      if (!cred) {
        return new Response(
          JSON.stringify({ error: "Provider not found for tenant" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clear all defaults, then set the chosen one
      await supabase
        .from("tenant_ai_credentials")
        .update({ is_default: false })
        .eq("tenant_id", tenantId);

      await supabase
        .from("tenant_ai_credentials")
        .update({ is_default: true })
        .eq("tenant_id", tenantId)
        .eq("provider", provider);

      return new Response(
        JSON.stringify({ success: true, provider }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'get' or 'set'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    log.error("ai-default-provider error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
