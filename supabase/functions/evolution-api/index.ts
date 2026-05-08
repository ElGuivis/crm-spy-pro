import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import {
  handleFetchInstances, handleCreate, handleConnect, handleRecreate,
  handleStatus, handleLogout, handleDelete,
  type ActionContext,
} from "../_shared/evolution-api-instance.ts";
import {
  handleCheckWebhook, handleReconfigureWebhook, handleUpdatePhoneNumber,
} from "../_shared/evolution-api-webhook.ts";

interface CreateInstancePayload {
  action: 'create' | 'connect' | 'status' | 'logout' | 'delete' | 'reconfigure-webhook' | 'check-webhook' | 'fetch-instances' | 'recreate' | 'update-phone-number';
  instanceName?: string;
  integrationId?: string;
  tenantId?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const cid = getCorrelationId(req);
  const log = createLogger("evolution-api", cid);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { userId: callerUserId, tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: CreateInstancePayload = await req.json();
    log.info(`[evolution-api] action=${payload.action}, instanceName=${payload.instanceName || 'N/A'}, user=${callerUserId}`);

    // SECURITY: validate tenant from body matches authenticated tenant
    assertTenantMatch(authTenantId, payload.tenantId, req);
    payload.tenantId = authTenantId;

    // SECURITY: validate integrationId belongs to this tenant (if provided)
    if (payload.integrationId) {
      await requireResource(supabase, "integrations", payload.integrationId, authTenantId, req);
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionUrl || !evolutionApiKey) throw new Error('Evolution API credentials not configured');

    const ctx: ActionContext = {
      supabase, baseUrl: evolutionUrl.replace(/\/$/, ''), evolutionApiKey,
      supabaseUrl, corsHeaders, log, tenantId: authTenantId,
      instanceName: payload.instanceName, integrationId: payload.integrationId,
    };

    switch (payload.action) {
      case 'fetch-instances': return await handleFetchInstances(ctx);
      case 'create':          return await handleCreate(ctx);
      case 'connect':         return await handleConnect(ctx);
      case 'recreate':        return await handleRecreate(ctx);
      case 'status':          return await handleStatus(ctx);
      case 'logout':          return await handleLogout(ctx);
      case 'delete':          return await handleDelete(ctx);
      case 'check-webhook':   return await handleCheckWebhook(ctx);
      case 'reconfigure-webhook': return await handleReconfigureWebhook(ctx);
      case 'update-phone-number': return await handleUpdatePhoneNumber(ctx);
      default: throw new Error(`Unknown action: ${payload.action}`);
    }
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[evolution-api] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
