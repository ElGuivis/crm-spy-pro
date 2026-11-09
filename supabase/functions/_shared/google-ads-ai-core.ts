/**
 * Camada de IA do modulo Google Ads (tipo B: so onde a regra nao basta).
 * O estrategista (regras) ja calcula tudo; a IA recebe um RESUMO numerico e responde em linguagem de consultor:
 * retomar x recriar campanhas, plano dos primeiros 30 dias, riscos e ideias de teste/textos para a verba de sobra.
 *
 * Privacidade (Politica de Dados de Usuario das APIs do Google): vai so o resumo agregado da conta (numeros e nomes
 * de campanha); nenhum dado de cliente. A IA fica DESLIGADA ate o administrador ligar na tela.
 */
import type { StrategyReport } from "./google-ads-strategy-rules.ts";

export interface AiProviderInfo { label: string; models: Array<{ id: string; label: string }>; }

/** Provedores que o CRM ja integra (mesmos de _shared/ai-chat-providers.ts). O primeiro modelo e o padrao. */
export const AI_PROVIDERS: Record<string, AiProviderInfo> = {
  groq: { label: "Groq", models: [
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (melhor raciocinio)" },
    { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (mais rapido)" },
    { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B" },
  ] },
  openai: { label: "OpenAI", models: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }, { id: "gpt-4o", label: "GPT-4o" }] },
  google: { label: "Google Gemini", models: [{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro" }] },
  mistral: { label: "Mistral", models: [{ id: "mistral-small-latest", label: "Mistral Small" }, { id: "mistral-large-latest", label: "Mistral Large" }] },
};

export const MAX_QUESTION_CHARS = 500;
export const ADVICE_MAX_TOKENS = 2500;

export interface AiSettings { ai_enabled: boolean; ai_provider: string | null; ai_model: string | null }

/** Valida a escolha vinda da tela: provedor conhecido e modelo da lista (modelo livre nao e aceito). */
export function validateAiSettings(input: { enabled?: unknown; provider?: unknown; model?: unknown }):
  { ok: true; value: AiSettings } | { ok: false; error: string } {
  if (typeof input.enabled !== "boolean") return { ok: false, error: "enabled deve ser verdadeiro ou falso" };
  if (!input.enabled && (input.provider == null || input.provider === "")) return { ok: true, value: { ai_enabled: false, ai_provider: null, ai_model: null } };
  const provider = String(input.provider ?? "");
  const info = AI_PROVIDERS[provider];
  if (!info) return { ok: false, error: "Provedor de IA desconhecido" };
  const model = input.model == null || input.model === "" ? info.models[0].id : String(input.model);
  if (!info.models.some((m) => m.id === model)) return { ok: false, error: "Modelo nao permitido para este provedor" };
  return { ok: true, value: { ai_enabled: input.enabled, ai_provider: provider, ai_model: model } };
}

export function readAiSettings(guardrails: unknown): AiSettings {
  const g = (guardrails && typeof guardrails === "object" ? guardrails : {}) as Record<string, unknown>;
  return {
    ai_enabled: g.ai_enabled === true,
    ai_provider: typeof g.ai_provider === "string" ? g.ai_provider : null,
    ai_model: typeof g.ai_model === "string" ? g.ai_model : null,
  };
}

const SYSTEM_PROMPT = `Voce e um consultor senior de Google Ads para e-commerce no Brasil. Fale em portugues claro, para um dono de loja que NAO e tecnico.

REGRAS OBRIGATORIAS:
1. Use SOMENTE os numeros fornecidos. Nao invente metricas, benchmarks, concorrentes, datas, sazonalidade, promocoes, precos, frete, cupons ou nomes de colecao: voce nao conhece a loja. Se faltar dado, diga "nao sei" e qual dado resolveria.
2. O PLANO CALCULADO PELAS REGRAS e a base. Nao o contradiga: nao mande pausar uma campanha que o plano mantem ligada nem ligar uma que o plano deixa de fora. Se discordar, diga em "O que eu nao sei" ou nos riscos, sem mudar os valores.
3. A soma dos orcamentos diarios NUNCA pode passar do LIMITE DIARIO informado. Se sugerir algo novo, ele sai da VERBA DE SOBRA (e so dela). Confira a conta antes de escrever.
4. Use o ROAS MINIMO informado (e diga se e provisorio). Nao invente outro numero de equilibrio.
5. "Marca" e "Marca #2" sao campanhas DIFERENTES; cite sempre o nome completo.
6. Resultados de campanha parada ha mais de 1 ano valem menos: o mercado mudou.
7. Mudancas bruscas de orcamento reiniciam o aprendizado dos lances; sugira etapas.
8. Textos de anuncio: use so o que aparece nos nomes das campanhas; onde faltar a oferta, escreva [preencher oferta]. Titulos ate 30 caracteres, descricoes ate 90.
9. Nao prometa resultado.

FORMATO (exatamente estes titulos, maximo ~400 palavras):
## Decisao
Uma linha: RETOMAR, RECRIAR ou HIBRIDO, e por que em uma frase.
## Por que (com numeros)
3 a 5 itens curtos, cada um com um numero do resumo.
## Plano dos primeiros 30 dias
Passos numerados: o que fazer primeiro (as pausas e reducoes antes das ativacoes) e o que olhar antes do proximo passo.
## Riscos e gatilhos de pausa
Quando pausar ou reduzir, usando o ROAS minimo informado e numero de dias.
## Para testar com a verba de sobra
Se a sobra for menor que R$ 10/dia, diga que nao ha verba para testes. Senao: 2 ideias de campanha nova e, para a melhor, 3 titulos e 2 descricoes.
## O que eu nao sei
Dados que faltam.`;

const STATUS_PT: Record<string, string> = { ENABLED: "ligada", PAUSED: "pausada", REMOVED: "removida" };
const VERDICT_PT: Record<string, string> = {
  running: "boa, manter ligada", reactivate: "boa, candidata a reativar", test_small: "so teste pequeno",
  keep_off: "manter desligada", insufficient: "dados insuficientes", removed: "removida (nao volta)",
};
const brl = (v: number | null) => (v == null ? "n/d" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`);

export interface MonthPoint { month: string; cost: number; revenue: number }

/** Resumo compacto (~1.5 a 2.5 mil tokens) para caber no limite de tokens por minuto de planos gratuitos. */
export function buildDigest(report: StrategyReport, last12: MonthPoint[]): string {
  const lines: string[] = [];
  lines.push(`TETO MENSAL: ${brl(report.monthly_cap)} (verba diaria ${brl(report.daily_target)}). ROAS minimo usado: ${report.min_roas}x${report.min_roas_is_provisional ? " (PROVISORIO, margem desconhecida)" : ""}.`);
  lines.push("ROAS POR ANO: " + report.years.filter((y) => y.cost > 0).map((y) => `${y.year}: gasto ${brl(y.cost)}, ROAS ${y.roas ?? "n/d"}x`).join(" | "));
  if (last12.length) {
    lines.push("ULTIMOS MESES COM GASTO: " + last12.map((m) => `${m.month} gasto ${Math.round(m.cost)} receita ${Math.round(m.revenue)}`).join("; "));
  }
  const planBy = new Map(report.plan.map((p) => [p.campaign_id, p]));
  lines.push("CAMPANHAS (nome | situacao no Google | tipo | gasto na vida | ROAS vida | ROAS recente | parada ha dias | gasto medio/dia quando ativa | orcamento atual | avaliacao das regras):");
  for (const c of report.campaigns.slice(0, 12)) {
    lines.push(`- "${c.name.slice(0, 60)}" | ${STATUS_PT[c.status] ?? c.status} | ${c.channel_type ?? "?"} | ${brl(c.lifetime.cost)} | ${c.lifetime.roas ?? "n/d"}x | ${c.recent.roas ?? "n/d"}x | ${c.dormant_days ?? "n/d"} | ${brl(c.avg_daily_spend_when_active)} | ${brl(c.current_daily_budget)} | ${VERDICT_PT[c.verdict]}${planBy.has(c.campaign_id) ? " [NO PLANO]" : ""}`);
  }
  const planned = report.plan.reduce((s, p) => s + (p.daily_budget_micros ?? 0), 0) / 1e6;
  if (report.plan.length) {
    lines.push("PLANO CALCULADO PELAS REGRAS (base obrigatoria): " + report.plan.map((p) => `"${p.name.slice(0, 50)}" -> ${p.action === "pause" ? "PAUSAR" : `${p.action === "enable" ? "REATIVAR" : "MANTER LIGADA e ajustar"} com ${brl((p.daily_budget_micros ?? 0) / 1e6)}/dia`}`).join("; "));
    lines.push(`SOMA DO PLANO: ${brl(planned)}/dia. LIMITE DIARIO: ${brl(report.daily_target)}. VERBA DE SOBRA: ${brl(Math.max((report.daily_target ?? 0) - planned, 0))}/dia.`);
  }
  if (report.warnings.length) lines.push("AVISOS: " + report.warnings.map((w) => w.slice(0, 220)).join(" "));
  return lines.join("\n");
}

export function buildAdvisorMessages(report: StrategyReport, last12: MonthPoint[], question: string | null): Array<{ role: "system" | "user"; content: string }> {
  const q = (question ?? "").trim().slice(0, MAX_QUESTION_CHARS) || "Devo pausar tudo e criar campanhas novas, ou retomar as que ja existem? Qual o proximo passo?";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `RESUMO DA CONTA (gerado por regras a partir do historico completo):\n${buildDigest(report, last12)}\n\nPERGUNTA DO DONO: ${q}` },
  ];
}
