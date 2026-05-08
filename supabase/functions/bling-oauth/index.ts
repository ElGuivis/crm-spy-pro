import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { encryptSecret } from "../_shared/secret-crypto.ts";
import { readBlingTokens } from "../_shared/credential-helpers.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BLING_CLIENT_ID = Deno.env.get('BLING_CLIENT_ID')!;
const BLING_CLIENT_SECRET = Deno.env.get('BLING_CLIENT_SECRET')!;

// Bling OAuth endpoints
const BLING_AUTH_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize';
const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token';
const BLING_REVOKE_URL = 'https://www.bling.com.br/Api/v3/oauth/revoke';

// Helper to create Basic Auth header
function getBasicAuthHeader(): string {
  const credentials = `${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`;
  return `Basic ${btoa(credentials)}`;
}

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
        return await getAuthUrl(supabase, body);
      
      case 'exchange':
        return await exchangeCode(supabase, body);
      
      case 'refresh':
        return await refreshToken(supabase, body);
      
      case 'disconnect':
        return await disconnect(supabase, body);
      
      case 'get_connection':
        return await getConnection(supabase, body);
      
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

// Generate OAuth URL and create state record
async function getAuthUrl(supabase: ServiceClient, body: { tenant_id: string; user_id: string; frontend_url?: string }) {
  const { tenant_id, user_id, frontend_url } = body;

  if (!tenant_id || !user_id) {
    return new Response(
      JSON.stringify({ error: 'Missing tenant_id or user_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Generate unique state
  const stateValue = crypto.randomUUID();

  // Store state in database (expires in 10 minutes)
  const { error: stateError } = await supabase
    .from('oauth_states')
    .insert({
      state: stateValue,
      tenant_id,
      user_id,
      provider: 'bling',
      redirect_path: '/integrations',
      frontend_url: frontend_url || PRIMARY_FRONTEND_URL,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

  if (stateError) {
    log.error('Error creating OAuth state:', stateError);
    return new Response(
      JSON.stringify({ error: 'Failed to create OAuth state' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Build Bling OAuth URL
  const authUrl = new URL(BLING_AUTH_URL);
  authUrl.searchParams.set('client_id', BLING_CLIENT_ID);
  authUrl.searchParams.set('state', stateValue);
  authUrl.searchParams.set('response_type', 'code');

  log.info('Generated Bling OAuth URL for tenant:', tenant_id);

  return new Response(
    JSON.stringify({ auth_url: authUrl.toString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Exchange authorization code for tokens
async function exchangeCode(supabase: ServiceClient, body: { code: string; state: string }) {
  const { code, state } = body;

  if (!code || !state) {
    return new Response(
      JSON.stringify({ error: 'Missing code or state' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  log.info('Exchanging code for tokens, state:', state);

  // Verify state and get tenant info
  const { data: stateData, error: stateError } = await supabase
    .from('oauth_states')
    .select('id, state, provider, user_id, tenant_id, frontend_url, redirect_path, expires_at')
    .eq('state', state)
    .eq('provider', 'bling')
    .single();

  if (stateError || !stateData) {
    log.error('Invalid or expired state:', stateError);
    return new Response(
      JSON.stringify({ error: 'Estado de autenticação inválido ou expirado' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if state is expired
  if (new Date(stateData.expires_at) < new Date()) {
    await supabase.from('oauth_states').delete().eq('id', stateData.id);
    return new Response(
      JSON.stringify({ error: 'Sessão expirada, tente novamente' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Delete the used state
  await supabase.from('oauth_states').delete().eq('id', stateData.id);

  try {
    // Exchange code for tokens using Basic Auth header (required by Bling)
    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      log.error('Token exchange error:', tokenData);
      throw new Error(tokenData.error_description || tokenData.error || 'Falha ao trocar código por tokens');
    }

    log.info('Token exchange successful');

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 21600; // Default 6 hours
    const refreshExpiresIn = 2592000; // 30 days for refresh token

    // Calculate token expirations
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000).toISOString();

    // Get scopes from response (if available)
    const scopes = tokenData.scope ? tokenData.scope.split(' ') : [];

    // Encrypt tokens before storage
    const encAccessToken = await encryptSecret(supabase, accessToken);
    const encRefreshToken = await encryptSecret(supabase, refreshToken);

    // Upsert connection (update if exists, insert if not)
    const { data: blingConnection, error: upsertError } = await supabase
      .from('bling_connections')
      .upsert({
        tenant_id: stateData.tenant_id,
        created_by_user_id: stateData.user_id,
        access_token: '',
        refresh_token: '',
        access_token_encrypted: encAccessToken,
        refresh_token_encrypted: encRefreshToken,
        token_expires_at: tokenExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        scopes: scopes,
        status: 'connected',
      }, {
        onConflict: 'tenant_id'
      })
      .select('id')
      .single();

    if (upsertError) {
      log.error('Error upserting connection:', upsertError);
      throw new Error('Falha ao salvar conexão');
    }

    // Create/update record in integrations table for display on Integrations page
    const { data: existingIntegration } = await supabase
      .from('integrations')
      .select('id')
      .eq('tenant_id', stateData.tenant_id)
      .eq('type', 'bling')
      .single();

    if (existingIntegration) {
      await supabase
        .from('integrations')
        .update({
          name: 'Bling ERP',
          status: 'connected',
          metadata: {
            bling_connection_id: blingConnection?.id,
          }
        })
        .eq('id', existingIntegration.id);
    } else {
      await supabase
        .from('integrations')
        .insert({
          tenant_id: stateData.tenant_id,
          type: 'bling',
          name: 'Bling ERP',
          status: 'connected',
          metadata: {
            bling_connection_id: blingConnection?.id,
          }
        });
    }

    log.info('Successfully connected Bling for tenant:', stateData.tenant_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    log.error('Exchange error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao processar autenticação';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Refresh access token using refresh token
async function refreshToken(supabase: ServiceClient, body: { tenant_id: string }) {
  const { tenant_id } = body;

  if (!tenant_id) {
    return new Response(
      JSON.stringify({ error: 'Missing tenant_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get current connection
  const { data: connection, error: connectionError } = await supabase
    .from('bling_connections')
    .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, bling_company_id')
    .eq('tenant_id', tenant_id)
    .single();

  if (connectionError || !connection) {
    return new Response(
      JSON.stringify({ error: 'Conexão Bling não encontrada' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Refresh token using Basic Auth header
    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: (await readBlingTokens(supabase, connection))?.refreshToken || "",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      log.error('Token refresh error:', tokenData);
      
      // Mark connection as disconnected if refresh fails
      await supabase
        .from('bling_connections')
        .update({ status: 'disconnected' })
        .eq('id', connection.id);
      
      await supabase
        .from('integrations')
        .update({ status: 'disconnected' })
        .eq('tenant_id', tenant_id)
        .eq('type', 'bling');

      throw new Error(tokenData.error_description || 'Falha ao renovar token');
    }

    const expiresIn = tokenData.expires_in || 21600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Write new tokens via encrypted helper
    const { writeBlingTokens } = await import("../_shared/credential-helpers.ts");
    const currentTokens = await readBlingTokens(supabase, connection);
    await writeBlingTokens(supabase, connection.id, tokenData.access_token, tokenData.refresh_token || currentTokens?.refreshToken || "", {
      token_expires_at: tokenExpiresAt,
      refresh_expires_at: tokenData.refresh_token 
        ? new Date(Date.now() + 2592000 * 1000).toISOString() 
        : connection.refresh_expires_at,
    });
    const updateError = null; // writeBlingTokens throws on failure

    if (updateError) {
      throw new Error('Falha ao atualizar tokens');
    }

    log.info('Token refreshed for tenant:', tenant_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    log.error('Refresh error:', error);
    const message = error instanceof Error ? error.message : 'Erro ao renovar token';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Disconnect Bling account
async function disconnect(supabase: ServiceClient, body: { tenant_id: string }) {
  const { tenant_id } = body;

  if (!tenant_id) {
    return new Response(
      JSON.stringify({ error: 'Missing tenant_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get current connection to revoke token
  const { data: connection } = await supabase
    .from('bling_connections')
    .select('id, access_token_encrypted')
    .eq('tenant_id', tenant_id)
    .single();

  if (connection) {
    try {
      // Resolve token for revocation
      const tokens = await readBlingTokens(supabase, connection);
      const tokenToRevoke = tokens?.accessToken || "";
      if (tokenToRevoke) {
        await fetch(BLING_REVOKE_URL, {
          method: 'POST',
          headers: {
            'Authorization': getBasicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: tokenToRevoke,
          }),
        });
        log.info('Token revoked at Bling');
      }
      log.info('Token revoked at Bling');
    } catch (error) {
      log.error('Error revoking token at Bling:', error);
      // Continue with local disconnect even if revoke fails
    }
  }

  // Delete from bling_connections
  const { error: deleteConnError } = await supabase
    .from('bling_connections')
    .delete()
    .eq('tenant_id', tenant_id);

  if (deleteConnError) {
    log.error('Error deleting connection:', deleteConnError);
  }

  // Update integration status
  const { error: updateIntError } = await supabase
    .from('integrations')
    .delete()
    .eq('tenant_id', tenant_id)
    .eq('type', 'bling');

  if (updateIntError) {
    log.error('Error deleting integration:', updateIntError);
  }

  log.info('Disconnected Bling for tenant:', tenant_id);

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get current connection status
async function getConnection(supabase: ServiceClient, body: { tenant_id: string }) {
  const { tenant_id } = body;

  if (!tenant_id) {
    return new Response(
      JSON.stringify({ error: 'Missing tenant_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('bling_connections')
    .select('id, status, scopes, token_expires_at, refresh_expires_at, created_at, updated_at')
    .eq('tenant_id', tenant_id)
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ connection: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if token is expired or about to expire
  const tokenExpired = new Date(data.token_expires_at) < new Date();
  const tokenExpiresSoon = new Date(data.token_expires_at) < new Date(Date.now() + 30 * 60 * 1000); // 30 min

  return new Response(
    JSON.stringify({ 
      connection: {
        ...data,
        token_expired: tokenExpired,
        token_expires_soon: tokenExpiresSoon,
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
