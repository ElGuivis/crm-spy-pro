/**
 * AI Provider Configuration & Fallback Logic
 * Extracted from ai-chat/index.ts for maintainability.
 */

import type { ServiceClient, ChatMessage, AICallResult, AICompletionResponse, AICredentialRecord } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("ai-chat-providers", "shared");


export interface AIProviderConfig {
  url: string;
  headers: Record<string, string>;
  modelPrefix: string;
  defaultModel: string;
  provider: 'openai' | 'google' | 'groq' | 'mistral';
  apiKey?: string;
}

const PROVIDER_ENDPOINTS: Record<string, { url: string; defaultModel: string }> = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', defaultModel: 'gemini-2.0-flash' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.1-70b-versatile' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', defaultModel: 'mistral-small-latest' },
};

const MODEL_MAPS: Record<string, Record<string, string>> = {
  openai: {
    'gemini-2.0-flash': 'gpt-4o-mini',
    'gemini-2.0-pro': 'gpt-4o',
    'llama-3.1-70b-versatile': 'gpt-4o',
    'llama-3.1-8b-instant': 'gpt-4o-mini',
    'mixtral-8x7b-32768': 'gpt-4o-mini',
    'mistral-small-latest': 'gpt-4o-mini',
    'mistral-large-latest': 'gpt-4o',
  },
  google: {
    'gpt-4o': 'gemini-2.0-pro',
    'gpt-4o-mini': 'gemini-2.0-flash',
    'llama-3.1-70b-versatile': 'gemini-2.0-pro',
    'llama-3.1-8b-instant': 'gemini-2.0-flash',
    'mixtral-8x7b-32768': 'gemini-2.0-flash',
    'mistral-small-latest': 'gemini-2.0-flash',
    'mistral-large-latest': 'gemini-2.0-pro',
  },
  groq: {
    'gemini-2.0-flash': 'llama-3.1-70b-versatile',
    'gemini-2.0-pro': 'llama-3.1-70b-versatile',
    'gpt-4o': 'llama-3.1-70b-versatile',
    'gpt-4o-mini': 'llama-3.1-8b-instant',
    'mistral-small-latest': 'mixtral-8x7b-32768',
    'mistral-large-latest': 'llama-3.1-70b-versatile',
  },
  mistral: {
    'gemini-2.0-flash': 'mistral-small-latest',
    'gemini-2.0-pro': 'mistral-large-latest',
    'gpt-4o': 'mistral-large-latest',
    'gpt-4o-mini': 'mistral-small-latest',
    'llama-3.1-70b-versatile': 'mistral-large-latest',
    'llama-3.1-8b-instant': 'mistral-small-latest',
    'mixtral-8x7b-32768': 'open-mixtral-8x7b',
  },
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.1-70b-versatile',
  mistral: 'mistral-small-latest',
};

export function buildProviderConfig(provider: string, apiKey: string): AIProviderConfig | null {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) return null;

  return {
    url: endpoint.url,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    modelPrefix: '',
    defaultModel: endpoint.defaultModel,
    provider: provider as AIProviderConfig['provider'],
    apiKey,
  };
}

/** Map a model name to the correct name for a given provider */
export function mapModelForProvider(model: string, provider: string): string {
  const map = MODEL_MAPS[provider];
  if (!map) return model;
  return map[model] || model.replace('openai/', '').replace('google/', '') || DEFAULT_MODELS[provider] || model;
}

/** Get AI configurations for all available providers of a tenant */
export async function getAllAIConfigs(supabase: ServiceClient, tenantId: string): Promise<AIProviderConfig[]> {
  const configs: AIProviderConfig[] = [];
  const addedProviders = new Set<string>();

  const { data: allCreds } = await supabase
    .from('tenant_ai_credentials')
    .select('id, provider, api_key_encrypted, is_active')
    .eq('tenant_id', tenantId);

  const typedCreds = (allCreds || []) as AICredentialRecord[];
  const activeCred = typedCreds.find((c) => c.is_active);

  // Add active credential first
  if (activeCred?.api_key_encrypted) {
    try {
      const { data: apiKey } = await supabase.rpc('decrypt_secret', { _ciphertext: activeCred.api_key_encrypted });
      if (apiKey) {
        const config = buildProviderConfig(activeCred.provider, apiKey as string);
        if (config) {
          configs.push(config);
          addedProviders.add(activeCred.provider);
        }
      }
    } catch {
      log.info(`⚠️ Failed to decrypt active credential for ${activeCred.provider}`);
    }
  }

  // Add fallback providers
  for (const cred of typedCreds) {
    if (cred.id === activeCred?.id || !cred.api_key_encrypted) continue;
    if (addedProviders.has(cred.provider)) continue;

    try {
      const { data: apiKey } = await supabase.rpc('decrypt_secret', { _ciphertext: cred.api_key_encrypted });
      if (apiKey) {
        const config = buildProviderConfig(cred.provider, apiKey as string);
        if (config) {
          configs.push(config);
          addedProviders.add(cred.provider);
        }
      }
    } catch {
      log.info(`⚠️ Failed to decrypt credential for ${cred.provider}`);
    }
  }

  log.info(`🔧 Loaded ${configs.length} AI providers: ${configs.map(c => c.provider).join(', ')}`);
  return configs;
}

/** Legacy helper — returns first available config */
export async function getAIConfig(supabase: ServiceClient, tenantId: string): Promise<AIProviderConfig | null> {
  const configs = await getAllAIConfigs(supabase, tenantId);
  if (configs.length > 0) return configs[0];
  log.info('❌ No AI provider configured for tenant', tenantId);
  return null;
}

/** Update provider health status in DB */
export async function updateProviderHealth(
  supabase: ServiceClient,
  tenantId: string,
  provider: string,
  success: boolean,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();

  if (success) {
    await supabase
      .from('ai_provider_health')
      .upsert({
        tenant_id: tenantId,
        provider,
        status: 'healthy',
        last_error_code: null,
        last_error_message: null,
        last_check_at: now,
        last_success_at: now,
        consecutive_failures: 0,
      }, { onConflict: 'tenant_id,provider' });
  } else {
    const { data: current } = await supabase
      .from('ai_provider_health')
      .select('consecutive_failures')
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .single();

    const failures = ((current as { consecutive_failures: number } | null)?.consecutive_failures || 0) + 1;
    const status = failures >= 3 ? 'error' : 'degraded';

    await supabase
      .from('ai_provider_health')
      .upsert({
        tenant_id: tenantId,
        provider,
        status,
        last_error_code: errorCode,
        last_error_message: errorMessage?.substring(0, 500),
        last_check_at: now,
        consecutive_failures: failures,
      }, { onConflict: 'tenant_id,provider' });
  }
}

/** Call AI with automatic fallback across providers */
export async function callAIWithFallback(
  supabase: ServiceClient,
  tenantId: string,
  messages: ChatMessage[],
  model: string,
  temperature: number,
  maxTokens: number,
  agentId?: string,
  conversationId?: string,
  preferredProvider?: string | null
): Promise<AICallResult> {
  let configs = await getAllAIConfigs(supabase, tenantId);

  if (preferredProvider) {
    const filtered = configs.filter(c => c.provider === preferredProvider);
    if (filtered.length > 0) {
      configs = filtered;
      log.info(`🎯 Using agent-preferred provider: ${preferredProvider}`);
    } else {
      log.info(`⚠️ Agent preferred provider '${preferredProvider}' not found, using all available`);
    }
  }

  if (configs.length === 0) {
    log.info('❌ No AI provider configured for tenant', tenantId);
    return { success: false, error: 'no_ai_provider' };
  }

  let lastError = '';

  for (const config of configs) {
    const mappedModel = mapModelForProvider(model, config.provider);
    log.info(`🔄 Trying ${config.provider} with model: ${mappedModel}`);

    const startTime = Date.now();

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify({
          model: mappedModel,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json() as AICompletionResponse;

        await updateProviderHealth(supabase, tenantId, config.provider, true);
        await supabase.from('ai_usage_logs').insert({
          tenant_id: tenantId,
          provider: config.provider,
          model: mappedModel,
          tokens_input: data.usage?.prompt_tokens || 0,
          tokens_output: data.usage?.completion_tokens || 0,
          agent_id: agentId || null,
          conversation_id: conversationId || null,
          response_time_ms: responseTimeMs,
          status: 'success',
        });

        log.info(`✅ ${config.provider} responded successfully (${responseTimeMs}ms)`);

        return {
          success: true,
          data,
          provider: config.provider,
          model: mappedModel,
        };
      }

      const errorText = await response.text();
      let errCode = `HTTP_${response.status}`;
      let errMessage = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        errCode = errorJson.error?.code || errorJson.error?.status || errCode;
        errMessage = errorJson.error?.message || errorText;
      } catch { /* not JSON */ }

      log.info(`⚠️ ${config.provider} failed: ${errCode} - ${errMessage.substring(0, 100)}`);

      await updateProviderHealth(supabase, tenantId, config.provider, false, errCode, errMessage);
      await supabase.from('ai_usage_logs').insert({
        tenant_id: tenantId,
        provider: config.provider,
        model: mappedModel,
        agent_id: agentId || null,
        conversation_id: conversationId || null,
        response_time_ms: responseTimeMs,
        status: 'error',
        error_message: `${errCode}: ${errMessage.substring(0, 200)}`,
      });

      lastError = `${config.provider}: ${errCode} - ${errMessage}`;
      continue;

    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
      log.info(`❌ ${config.provider} fetch error: ${errorMsg}`);
      lastError = `${config.provider}: ${errorMsg}`;
      await updateProviderHealth(supabase, tenantId, config.provider, false, 'FETCH_ERROR', errorMsg);
      continue;
    }
  }

  log.error(`❌ All AI providers failed. Last error: ${lastError}`);
  return { success: false, error: lastError };
}
