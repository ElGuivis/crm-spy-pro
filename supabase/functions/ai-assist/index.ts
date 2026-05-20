import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface AIProviderConfig {
  url: string;
  headers: Record<string, string>;
  provider: string;
}

function buildProviderConfig(provider: string, apiKey: string): AIProviderConfig | null {
  const configs: Record<string, { url: string }> = {
    openai: { url: 'https://api.openai.com/v1/chat/completions' },
    google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    groq: { url: 'https://api.groq.com/openai/v1/chat/completions' },
    mistral: { url: 'https://api.mistral.ai/v1/chat/completions' },
  };
  const cfg = configs[provider];
  if (!cfg) return null;
  return {
    url: cfg.url,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    provider,
  };
}

async function getAIConfig(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<AIProviderConfig | null> {
  const { data: creds } = await supabase
    .from('tenant_ai_credentials')
    .select('id, provider, api_key_encrypted, is_active, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1);

  const cred = creds?.[0];
  if (cred?.api_key_encrypted) {
    try {
      const { data: apiKey } = await supabase.rpc('decrypt_secret', { _ciphertext: cred.api_key_encrypted });
      if (apiKey) return buildProviderConfig(cred.provider, apiKey);
    } catch { /* ignore */ }
  }

  const { data: defaultCred } = await supabase
    .from('tenant_ai_credentials')
    .select('id, provider, api_key_encrypted, is_default')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .limit(1);

  if (defaultCred?.[0]?.api_key_encrypted) {
    try {
      const { data: apiKey } = await supabase.rpc('decrypt_secret', { _ciphertext: defaultCred[0].api_key_encrypted });
      if (apiKey) return buildProviderConfig(defaultCred[0].provider, apiKey);
    } catch { /* ignore */ }
  }

  return null;
}

function getModel(provider: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-4o-mini',
    google: 'gemini-2.0-flash',
    groq: 'llama-3.1-70b-versatile',
    mistral: 'mistral-small-latest',
  };
  return models[provider] || 'gpt-4o-mini';
}

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("ai-assist", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Standardized auth via shared guard
    const { tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, conversation_id, tenant_id } = await req.json();

    // Validate body tenant_id matches authenticated tenant
    assertTenantMatch(tenantId, tenant_id, req);

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'Missing conversation_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiConfig = await getAIConfig(supabase, tenantId);
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: 'no_ai_provider', message: 'Nenhum provedor de IA configurado. Configure nas Integrações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: validate conversation belongs to authenticated tenant via requireResource
    await requireResource(supabase, "conversations", conversation_id, tenantId, req);

    // Get recent messages (tenant-scoped via conversation ownership check above)
    const { data: messages } = await supabase
      .from('messages')
      .select('content, direction, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(30);

    const reversedMsgs = (messages || []).reverse();
    const chatHistory = reversedMsgs.map((m: Record<string, unknown>) => ({
      role: m.direction === 'incoming' ? 'user' : 'assistant',
      content: m.content,
    }));

    let systemPrompt = '';
    let maxTokens = 300;

    if (action === 'suggest') {
      systemPrompt = `Você é um assistente de atendimento ao cliente de uma loja online brasileira. Com base no histórico da conversa, sugira UMA resposta profissional, empática e útil que o atendente pode enviar ao cliente. Responda apenas com o texto da sugestão, sem explicações. Mantenha o tom profissional mas amigável. Em português brasileiro.`;
      maxTokens = 400;
    } else if (action === 'summarize') {
      systemPrompt = `Você é um assistente que resume conversas de atendimento ao cliente. Analise o histórico e forneça um resumo conciso em até 3 frases, destacando: o motivo do contato, ações tomadas e status atual. Em português brasileiro. Responda apenas com o resumo.`;
      maxTokens = 300;
    } else if (action === 'sentiment') {
      systemPrompt = `Analise o sentimento da última mensagem do cliente nesta conversa. Responda APENAS com um JSON no formato: {"sentiment": "positive"|"neutral"|"negative", "confidence": 0.0-1.0}. Nenhum texto adicional.`;
      maxTokens = 50;
    } else if (action === 'classify') {
      systemPrompt = `Classifique a intenção principal desta conversa de atendimento ao cliente. Opções: "compra" (consulta de produto, preço, disponibilidade, pedido novo), "suporte" (problema técnico, dúvida de uso, ajuda geral), "reclamacao" (insatisfação, produto errado, entrega atrasada, reembolso), "outro". Responda APENAS com um JSON no formato: {"intent":"compra"|"suporte"|"reclamacao"|"outro","confidence":0.0-1.0}. Nenhum texto adicional.`;
      maxTokens = 60;
    } else if (action === 'translate') {
      systemPrompt = `Traduza a última mensagem do cliente para português brasileiro. Se já estiver em português, traduza para inglês. Responda apenas com a tradução.`;
      maxTokens = 300;
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = getModel(aiConfig.provider);

    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: aiConfig.headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatHistory,
        ],
        max_tokens: maxTokens,
        temperature: action === 'sentiment' ? 0.1 : 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`AI provider error (${aiConfig.provider}):`, response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI provider error', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // For JSON-response actions, parse the response
    if (action === 'classify') {
      try {
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify({ result: parsed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ result: { intent: 'outro', confidence: 0.5 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sentiment') {
      try {
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify({ result: parsed }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ result: { sentiment: 'neutral', confidence: 0.5 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (error instanceof Response) return error;
    log.error('ai-assist error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...getRestrictedCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
