import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { encryptSecret } from "../_shared/secret-crypto.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("manage-credentials", cid);
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

    // Verify user is tenant admin
    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _user_id: userId,
      _tenant_id: tenantId,
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem gerenciar credenciais" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action } = body;

    // =========================================================================
    // ACTION: save — Encrypt and store AI API key
    // =========================================================================
    if (action === "save") {
      const { provider, api_key, name } = body;

      if (!provider || !api_key) {
        return new Response(
          JSON.stringify({ error: "provider and api_key are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Encrypt the API key server-side
      const encrypted = await encryptSecret(supabase, api_key.trim());
      if (!encrypted) {
        return new Response(
          JSON.stringify({ error: "Failed to encrypt credential" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert to tenant_ai_credentials
      const { error: credError } = await supabase
        .from("tenant_ai_credentials")
        .upsert(
          {
            tenant_id: tenantId,
            provider,
            api_key_encrypted: encrypted,
            is_active: true,
          },
          { onConflict: "tenant_id,provider" }
        );

      if (credError) {
        log.error("[manage-credentials] Upsert error:", credError);
        return new Response(
          JSON.stringify({ error: credError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Also upsert integrations record for UI display (NO secrets in metadata)
      const integrationType = `ai_${provider}`;
      const { data: existingInteg } = await supabase
        .from("integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("type", integrationType)
        .maybeSingle();

      if (existingInteg) {
        await supabase
          .from("integrations")
          .update({ name: name || `AI ${provider}`, status: "connected", metadata: { provider } })
          .eq("id", existingInteg.id);
      } else {
        await supabase.from("integrations").insert({
          tenant_id: tenantId,
          type: integrationType,
          name: name || `AI ${provider}`,
          status: "connected",
          metadata: { provider },
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: delete — Remove AI credential
    // =========================================================================
    if (action === "delete") {
      const { provider } = body;

      await supabase
        .from("tenant_ai_credentials")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("provider", provider);

      await supabase
        .from("integrations")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("type", `ai_${provider}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: check — Return masked status (never return actual key)
    // =========================================================================
    if (action === "check") {
      const { provider } = body;

      const { data: cred } = await supabase
        .from("tenant_ai_credentials")
        .select("provider, is_active, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle();

      return new Response(
        JSON.stringify({ configured: !!cred, credential: cred }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: list — Return all credentials summary (no secrets)
    // =========================================================================
    if (action === "list") {
      const { data: creds } = await supabase
        .from("tenant_ai_credentials")
        .select("id, provider, is_active, is_default, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      return new Response(
        JSON.stringify({ credentials: creds || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: provider-status — Check if a provider is active + healthy
    // =========================================================================
    if (action === "provider-status") {
      const { provider } = body;

      if (!provider) {
        return new Response(
          JSON.stringify({ error: "provider is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: cred } = await supabase
        .from("tenant_ai_credentials")
        .select("is_active")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle();

      const { data: health } = await supabase
        .from("ai_provider_health")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle();

      const isConnected = !!cred && cred.is_active !== false && health?.status !== "error";

      return new Response(
        JSON.stringify({ isConnected, hasCredential: !!cred, healthStatus: health?.status || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: save, delete, check, list, provider-status" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    log.error("[manage-credentials] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
