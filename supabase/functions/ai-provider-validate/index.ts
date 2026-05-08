import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface ValidateRequest {
  tenant_id: string;
  provider: 'openai' | 'google' | 'groq' | 'mistral';
}

interface ProviderConfig {
  url: string;
  model: string;
  successMessage: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', successMessage: 'OpenAI conectado com sucesso!' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', successMessage: 'Google AI conectado com sucesso!' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant', successMessage: 'Groq conectado com sucesso!' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', successMessage: 'Mistral AI conectado com sucesso!' },
};

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("ai-provider-validate", cid);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenantId: authTenantId } = await requireUserAuth(req);
    const { tenant_id, provider }: ValidateRequest = await req.json();
    assertTenantMatch(authTenantId, tenant_id, req);
    const effectiveTenantId = authTenantId;

    log.info("Validating credentials", { provider, tenantId: effectiveTenantId });

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return new Response(JSON.stringify({ ok: false, error_code: 'INVALID_PROVIDER', error_message: `Provedor '${provider}' não suportado` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch encrypted credentials
    const { data: creds } = await supabase
      .from('tenant_ai_credentials')
      .select('id, provider, api_key_encrypted, is_active, is_default')
      .eq('tenant_id', effectiveTenantId)
      .eq('provider', provider)
      .single();

    let apiKey: string | null = null;
    if (creds?.api_key_encrypted) {
      log.info("Found credentials in tenant_ai_credentials", { provider });
      const { data: decrypted } = await supabase.rpc('decrypt_secret', { _ciphertext: creds.api_key_encrypted });
      apiKey = decrypted;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({
        ok: false, error_code: 'NOT_CONFIGURED',
        error_message: `Credenciais ${provider} não configuradas. Configure a integração na página de Integrações.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    log.info("Testing provider API", { provider });

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'test' }], max_tokens: 5 }),
    });

    const now = new Date().toISOString();

    if (response.ok) {
      log.info("Credentials valid", { provider });
      await supabase.from('ai_provider_health').upsert({
        tenant_id: effectiveTenantId, provider, status: 'healthy',
        last_error_code: null, last_error_message: null, last_check_at: now, last_success_at: now, consecutive_failures: 0,
      }, { onConflict: 'tenant_id,provider' });

      return new Response(JSON.stringify({ ok: true, message: config.successMessage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle errors
    const errorText = await response.text();
    let errorCode = `HTTP_${response.status}`;
    let errorMessage = 'Erro desconhecido';

    try {
      const errorJson = JSON.parse(errorText);
      errorCode = errorJson.error?.code || errorJson.error?.status || errorCode;
      errorMessage = errorJson.error?.message || errorText;

      if (provider === 'openai' && errorCode === 'insufficient_quota') {
        errorMessage = 'Sem créditos/quota disponível. Verifique seu billing na OpenAI.';
      }
      if (response.status === 401 || response.status === 403) {
        errorMessage = provider === 'openai' ? 'Chave API inválida ou expirada.' : 'Chave API inválida ou sem permissão.';
      }
    } catch {
      errorMessage = errorText.substring(0, 200);
    }

    log.warn("Validation failed", { provider, errorCode, status: response.status });

    await supabase.from('ai_provider_health').upsert({
      tenant_id: effectiveTenantId, provider,
      status: response.status === 429 ? 'degraded' : 'error',
      last_error_code: errorCode, last_error_message: errorMessage.substring(0, 500),
      last_check_at: now, consecutive_failures: ((creds as Record<string, unknown>)?.consecutive_failures || 0) + 1,
    }, { onConflict: 'tenant_id,provider' });

    return new Response(JSON.stringify({ ok: false, error_code: errorCode, error_message: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("Validation error", { error: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ ok: false, error_code: 'INTERNAL_ERROR', error_message: error instanceof Error ? error.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
