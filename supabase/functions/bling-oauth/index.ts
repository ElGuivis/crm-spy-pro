import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getAuthUrl, exchangeCode, refreshToken, disconnect, getConnection } from "./actions.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;


serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("bling-oauth", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // =========================================================================
    // TRUST BOUNDARY (see FUNCTION_CLASSIFICATION.md §Trust Boundary: bling-oauth)
    //
    // - get_auth_url, refresh, disconnect, get_connection → AUTHENTICATED (JWT)
    // - exchange → STATE-BASED (oauth_states DB lookup, one-time use, 10-min TTL)
    // =========================================================================
    if (action !== 'exchange') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: authTenantId } = await supabase.rpc('get_user_tenant_id', { _user_id: user.id });
      if (!authTenantId) {
        return new Response(JSON.stringify({ error: 'Tenant not found' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Override body tenant_id/user_id with authenticated values
      body.tenant_id = authTenantId;
      body.user_id = user.id;
    }

    switch (action) {
      case 'get_auth_url':
        return await getAuthUrl(supabase, body, { log, corsHeaders });
      
      case 'exchange':
        return await exchangeCode(supabase, body, { log, corsHeaders });
      
      case 'refresh':
        return await refreshToken(supabase, body, { log, corsHeaders });
      
      case 'disconnect':
        return await disconnect(supabase, body, { log, corsHeaders });
      
      case 'get_connection':
        return await getConnection(supabase, body, { log, corsHeaders });
      
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    log.error('Error in bling-oauth:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
