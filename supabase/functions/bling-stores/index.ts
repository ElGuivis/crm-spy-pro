import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import type { BlingConnectionRecord, ServiceClient } from "../_shared/supabase-types.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';

async function ensureValidToken(supabase: ServiceClient, connection: BlingConnectionRecord): Promise<string> {
  return ensureBlingToken(supabase, connection, '[bling-stores]');
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("bling-stores", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { integrationId, tenantId } = body;

    // Validate tenant access
    assertTenantMatch(authTenantId, tenantId, req);

    log.info(`[bling-stores] Fetching stores for integration=${integrationId}, tenant=${authTenantId}`);

    if (!integrationId && !authTenantId) {
      return new Response(
        JSON.stringify({ error: 'integrationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveTenantId = authTenantId;

    if (!effectiveTenantId) {
      return new Response(
        JSON.stringify({ error: 'Could not determine tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Bling connection
    const { data: connection, error: connError } = await supabase
      .from('bling_connections')
      .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, bling_company_id')
      .eq('tenant_id', effectiveTenantId)
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      log.error('[bling-stores] Bling connection not found:', connError);
      return new Response(
        JSON.stringify({ error: 'Bling connection not found', stores: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure valid token
    const accessToken = await ensureValidToken(supabase, connection);

    // Fetch canais de venda (sales channels) from Bling API
    log.info('[bling-stores] Fetching canais-venda from Bling API...');
    
    const canaisResponse = await fetch(`${BLING_API_BASE}/canais-venda?limite=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!canaisResponse.ok) {
      const errorText = await canaisResponse.text();
      log.error('[bling-stores] Error fetching canais-venda:', errorText);
      
      return new Response(
        JSON.stringify({ stores: [], error: 'Failed to fetch sales channels', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const canaisData = await canaisResponse.json();
    const canais = (canaisData.data || []).map((canal: Record<string, unknown>) => ({
      id: canal.id,
      name: canal.descricao || `Canal ${canal.id}`,
      type: canal.tipo || 'canal_venda',
    }));

    log.info(`[bling-stores] Found ${canais.length} canais de venda`);

    return new Response(
      JSON.stringify({ stores: canais }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    log.error('[bling-stores] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
