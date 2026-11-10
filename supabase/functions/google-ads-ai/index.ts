import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { callAIWithFallback } from "../_shared/ai-chat-providers.ts";
import {
  ADVICE_MAX_TOKENS, AI_PROVIDERS, buildAdvisorMessages, MAX_QUESTION_CHARS, readAiSettings, type MonthPoint,
} from "../_shared/google-ads-ai-core.ts";
import { runInsights } from "../_shared/google-ads-insights-runner.ts";
import { runStrategy } from "../_shared/google-ads-strategy-runner.ts";

/**
 * google-ads-ai — AUTHENTICATED, somente administradores do tenant.
 *  - action "providers": quais IAs ja estao integradas no CRM (tenant_ai_credentials), sem expor chave nenhuma.
 *  - action "advise": { account_id, question? } pede o parecer do consultor com IA usando o provedor/modelo escolhidos na conta.
 * A IA so le um RESUMO numerico gerado pelas regras; nao escreve no Google Ads (so grava o texto em google_ads_recommendations).
 * Reaproveita o chamador do CRM (callAIWithFallback): credencial cifrada do tenant, saude do provedor e ai_usage_logs.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_INTERVAL_MS = 15_000;
export const ADVICE_AGENT = "strategy_ai";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("google-ads-ai", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);
    const body = await req.json().catch(() => ({}));
    if (body.action !== "providers" && body.action !== "advise") return json({ error: "Acao desconhecida" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: userId, _tenant_id: tenantId });
    if (!isAdmin) return json({ error: "Somente administradores" }, 403);

    const { data: creds, error: credErr } = await supabase.from("tenant_ai_credentials")
      .select("provider, is_active, api_key_encrypted").eq("tenant_id", tenantId);
    if (credErr) throw new Error(credErr.message);
    const configured = new Set((creds ?? []).filter((c) => c.api_key_encrypted).map((c) => c.provider as string));

    if (body.action === "providers") {
      const providers = Object.entries(AI_PROVIDERS)
        .filter(([id]) => configured.has(id))
        .map(([id, info]) => ({ id, label: info.label, models: info.models, is_default: (creds ?? []).some((c) => c.provider === id && c.is_active) }));
      return json({ providers });
    }

    const accountId = typeof body.account_id === "string" ? body.account_id : "";
    if (!UUID_RE.test(accountId)) return json({ error: "account_id invalido" }, 400);
    if (body.question != null && (typeof body.question !== "string" || body.question.length > MAX_QUESTION_CHARS)) {
      return json({ error: `A pergunta deve ter ate ${MAX_QUESTION_CHARS} caracteres` }, 400);
    }
    const { data: account } = await supabase.from("google_ads_accounts").select("id, guardrails")
      .eq("id", accountId).eq("tenant_id", tenantId).maybeSingle();
    if (!account) return json({ error: "Conta nao encontrada" }, 404);

    const ai = readAiSettings(account.guardrails);
    if (!ai.ai_enabled) return json({ error: "A IA esta desligada para esta conta. Ligue e escolha o provedor na tela." }, 403);
    if (!ai.ai_provider || !AI_PROVIDERS[ai.ai_provider]) return json({ error: "Escolha o provedor de IA" }, 400);
    if (!configured.has(ai.ai_provider)) return json({ error: `O provedor ${AI_PROVIDERS[ai.ai_provider].label} nao esta integrado no CRM` }, 400);
    const model = ai.ai_model ?? AI_PROVIDERS[ai.ai_provider].models[0].id;

    const { data: prev } = await supabase.from("google_ads_recommendations").select("id, updated_at")
      .eq("account_id", accountId).eq("agent", ADVICE_AGENT).eq("dedupe_key", "ai:advice").maybeSingle();
    if (prev && Date.now() - new Date(prev.updated_at).getTime() < MIN_INTERVAL_MS) {
      return json({ error: "Aguarde alguns segundos antes de pedir outro parecer" }, 429);
    }

    // Relatorio das regras sempre fresco: a IA nunca opina sobre numeros velhos.
    const strategy = await runStrategy(supabase, accountId, `user:${userId}`);
    if (!strategy.ok || !strategy.report) return json({ error: strategy.error ?? "Falha ao calcular o resumo" }, 500);

    const { data: months } = await supabase.from("google_ads_account_monthly").select("month, cost_micros, conversions_value")
      .eq("account_id", accountId).gt("cost_micros", 0).order("month", { ascending: false }).limit(12);
    const last12: MonthPoint[] = (months ?? []).reverse().map((m) => ({
      month: String(m.month).slice(0, 7), cost: Number(m.cost_micros) / 1e6, revenue: Number(m.conversions_value),
    }));

    const insights = await runInsights(supabase, accountId, `user:${userId}`);
    const messages = buildAdvisorMessages(strategy.report, last12, typeof body.question === "string" ? body.question : null, insights.ok ? insights.report ?? null : null);
    const result = await callAIWithFallback(supabase, tenantId, messages, model, 0.3, ADVICE_MAX_TOKENS, undefined, undefined, ai.ai_provider);
    if (!result.success) return json({ error: `A IA nao respondeu: ${String(result.error).slice(0, 300)}` }, 502);

    const raw = result.data?.choices?.[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) return json({ error: "A IA devolveu uma resposta vazia. Tente de novo ou troque o modelo." }, 502);

    const fields = {
      kind: "ai_advice", severity: "low", risk: "low",
      title: `Parecer da IA (${AI_PROVIDERS[ai.ai_provider].label})`,
      rationale: text.slice(0, 7900),
      payload: {
        provider: result.provider, model: result.model, generated_at: new Date().toISOString(),
        question: (typeof body.question === "string" ? body.question : "").slice(0, MAX_QUESTION_CHARS),
        tokens_input: result.data?.usage?.prompt_tokens ?? null, tokens_output: result.data?.usage?.completion_tokens ?? null,
      },
    };
    if (prev) {
      await supabase.from("google_ads_recommendations").update({ ...fields, status: "pending" }).eq("id", prev.id);
    } else {
      await supabase.from("google_ads_recommendations").insert({ tenant_id: tenantId, account_id: accountId, agent: ADVICE_AGENT, dedupe_key: "ai:advice", status: "pending", ...fields });
    }
    await supabase.from("google_ads_audit_log").insert({
      tenant_id: tenantId, account_id: accountId, actor: `user:${userId}`, action: "ai_advice",
      after_state: { provider: result.provider, model: result.model, tokens_input: fields.payload.tokens_input, tokens_output: fields.payload.tokens_output },
    });
    return json({ ok: true, provider: result.provider, model: result.model, text });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em google-ads-ai", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
