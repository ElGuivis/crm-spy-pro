import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { readMelhorEnvioTokens } from "../_shared/credential-helpers.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { checkNewShipments } from "./check-new.ts";
import { updateTracking } from "./update-tracking.ts";
import { processCron } from "./process-cron.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("me-job-processor", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "process";
    const integrationId = body.integrationId;

    log.info(`[me-job-processor] Action: ${action}, IntegrationId: ${integrationId || 'all'}, isInternal=${auth.isInternal}`);

    if (!auth.isInternal && auth.tenantId && integrationId) {
      await requireResource(supabase, "integrations", integrationId, auth.tenantId, req);
    }

    switch (action) {
      case "check-new": {
        if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: integration } = await supabase.from("integrations").select("tenant_id").eq("id", integrationId).single();
        if (!integration) return new Response(JSON.stringify({ success: false, error: "Integração não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: tokenRecord } = await supabase.from("melhor_envio_tokens").select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at").eq("tenant_id", integration.tenant_id).single();
        if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) return new Response(JSON.stringify({ success: false, error: "Token expirado ou inexistente" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const meTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
        const accessToken = meTokens?.accessToken;
        if (!accessToken) return new Response(JSON.stringify({ success: false, error: "Token não pode ser descriptografado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { newShipments } = await checkNewShipments(supabase, integrationId, integration.tenant_id, accessToken, log);
        return new Response(JSON.stringify({ success: true, newShipments }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "update-tracking": {
        if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: integration } = await supabase.from("integrations").select("tenant_id").eq("id", integrationId).single();
        if (!integration) return new Response(JSON.stringify({ success: false, error: "Integração não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data: tokenRecord } = await supabase.from("melhor_envio_tokens").select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at").eq("tenant_id", integration.tenant_id).single();
        if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) return new Response(JSON.stringify({ success: false, error: "Token expirado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const meTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
        const accessToken = meTokens?.accessToken;
        if (!accessToken) return new Response(JSON.stringify({ success: false, error: "Token não pode ser descriptografado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { updated, reconciled } = await updateTracking(supabase, integrationId, integration.tenant_id, accessToken, log);
        return new Response(JSON.stringify({ success: true, updated, reconciled }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "process":
      default: {
        const result = await processCron(supabase, log);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[me-job-processor] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
