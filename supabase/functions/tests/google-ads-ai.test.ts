import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_PROVIDERS, buildAdvisorMessages, buildDigest, readAiSettings, validateAiSettings } from "../_shared/google-ads-ai-core.ts";
import { buildStrategy } from "../_shared/google-ads-strategy-rules.ts";

const R = (v: number) => v * 1_000_000;
const report = buildStrategy({
  now: new Date("2026-11-09T12:00:00Z"), monthlyCapMicros: R(2000), minRoas: null,
  campaigns: [{ campaign_id: 1, name: "Marca", status: "PAUSED", channel_type: "SEARCH", daily_budget_micros: R(100) }],
  lifetime: [{ campaign_id: 1, cost_micros: R(52588), conversions_value: 373362, first_spend_date: "2023-11-18", last_spend_date: "2025-05-20" }],
  monthly: [{ campaign_id: 1, month: "2025-05-01", cost_micros: R(1000), conversions_value: 7000, days_with_spend: 20 }],
  conversionActions: [],
});

Deno.test("validateAiSettings: aceita provedor e modelo da lista; modelo livre e provedor desconhecido sao recusados", () => {
  assertEquals(validateAiSettings({ enabled: true, provider: "groq", model: "openai/gpt-oss-20b" }), { ok: true, value: { ai_enabled: true, ai_provider: "groq", ai_model: "openai/gpt-oss-20b" } });
  assertEquals(validateAiSettings({ enabled: true, provider: "groq" }), { ok: true, value: { ai_enabled: true, ai_provider: "groq", ai_model: AI_PROVIDERS.groq.models[0].id } });
  assert(!validateAiSettings({ enabled: true, provider: "groq", model: "qualquer-coisa" }).ok);
  assert(!validateAiSettings({ enabled: true, provider: "anthropic" }).ok);
  assert(!validateAiSettings({ enabled: "sim", provider: "groq" }).ok);
});

Deno.test("validateAiSettings: desligar sem provedor zera tudo; desligar mantendo escolha tambem e permitido", () => {
  assertEquals(validateAiSettings({ enabled: false }), { ok: true, value: { ai_enabled: false, ai_provider: null, ai_model: null } });
  const keep = validateAiSettings({ enabled: false, provider: "openai", model: "gpt-4o" });
  assertEquals(keep.ok && keep.value.ai_enabled, false);
});

Deno.test("readAiSettings: IA desligada por padrao e tolera lixo", () => {
  assertEquals(readAiSettings({}).ai_enabled, false);
  assertEquals(readAiSettings(null).ai_enabled, false);
  assertEquals(readAiSettings({ ai_enabled: "true" }).ai_enabled, false);
  assertEquals(readAiSettings({ ai_enabled: true, ai_provider: "groq", ai_model: "m" }), { ai_enabled: true, ai_provider: "groq", ai_model: "m" });
});

Deno.test("buildDigest: tem o teto, o ROAS provisorio e os numeros da campanha; sem dados pessoais e curto", () => {
  const d = buildDigest(report, [{ month: "2025-05", cost: 1000, revenue: 7000 }]);
  assert(d.includes("PROVISORIO"));
  assert(d.includes("Marca"));
  assert(d.includes("2025-05 gasto 1000 receita 7000"));
  assert(d.length < 6000, `resumo grande demais: ${d.length}`);
});

Deno.test("buildAdvisorMessages: pergunta padrao, limite de tamanho e regras de nao inventar no prompt", () => {
  const m = buildAdvisorMessages(report, [], null);
  assertEquals(m.map((x) => x.role), ["system", "user"]);
  assert(m[0].content.includes("SOMENTE os numeros fornecidos"));
  assert(m[1].content.includes("Devo pausar tudo"));
  const long = buildAdvisorMessages(report, [], "x".repeat(2000));
  assert(long[1].content.length < m[1].content.length + 600);
});
