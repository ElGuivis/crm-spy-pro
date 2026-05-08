import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("li-validate", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireUserAuth(req);

    const { apiKey, integrationId } = await req.json();

    // Get the internal APP_KEY from secrets
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY');

    if (!appKey) {
      log.error('LOJA_INTEGRADA_APP_KEY not configured');
      return new Response(JSON.stringify({
        valid: false,
        error: 'Configuração interna incompleta'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve the API key: either passed directly or fetched from DB by integrationId
    let resolvedApiKey = apiKey;

    if (!resolvedApiKey && integrationId) {
      log.info('Fetching API key from DB for integration:', integrationId);

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: integration, error: dbError } = await supabaseAdmin
        .from('integrations')
        .select('api_key')
        .eq('id', integrationId)
        .maybeSingle();

      if (dbError) {
        log.error('DB error fetching integration:', dbError.message);
        return new Response(JSON.stringify({
          valid: false,
          error: 'Erro ao buscar integração'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!integration?.api_key) {
        log.error('No API key found for integration:', integrationId);
        return new Response(JSON.stringify({
          valid: false,
          error: 'API Key não configurada para esta integração'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      resolvedApiKey = integration.api_key;
    }

    if (!resolvedApiKey) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'API Key não fornecida'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = `chave_api ${resolvedApiKey} aplicacao ${appKey}`;

    log.info('Validating API key with Loja Integrada...');

    // Try to fetch a simple endpoint to validate the key
    const response = await fetch(`${LI_API_BASE}/pedido?limit=1`, {
      headers: { 'Authorization': authHeader }
    });

    if (response.ok) {
      log.info('API key validation successful');
      return new Response(JSON.stringify({
        valid: true,
        message: 'API Key válida'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const statusText = response.statusText;
      log.error(`API key validation failed: ${response.status} ${statusText}`);
      return new Response(JSON.stringify({
        valid: false,
        error: response.status === 401 || response.status === 403
          ? 'API Key inválida ou sem permissão'
          : `Erro na validação: ${response.status}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Validation error:', errorMessage);
    return new Response(JSON.stringify({
      valid: false,
      error: 'Erro ao validar API Key'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
