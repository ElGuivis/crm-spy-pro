import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runExtraDiagnosis, type ExtraInput } from "../_shared/google-ads-diagnosis-extra.ts";

const NOW = new Date("2026-11-20T12:00:00Z");
const base = (o: Partial<ExtraInput> = {}): ExtraInput => ({
  now: NOW, accountId: "a1", minRoas: 4, alertRoas: 3,
  campaigns: [{ campaign_id: 1, name: "Marca", status: "ENABLED", daily_budget_micros: 40e6 }], daily: [], changes: [], ads: [], ...o,
});
const days = (n: number, costBrl: number, valueBrl: number) =>
  Array.from({ length: n }, (_, k) => ({ campaign_id: 1, date: new Date(NOW.getTime() - (k + 1) * 86_400_000).toISOString().slice(0, 10), cost_micros: costBrl * 1e6, conversions_value: valueBrl }));
const rules = (i: ExtraInput) => runExtraDiagnosis(i).map((f) => f.rule + ":" + f.severity);

Deno.test("R9: ROAS 7d abaixo do alerta = high; entre alerta e minimo = medium; acima = nada; pouco gasto = nada", () => {
  assert(rules(base({ daily: days(7, 40, 100) })).includes("R9:high"));   // 2,5x
  assert(rules(base({ daily: days(7, 40, 140) })).includes("R9:medium")); // 3,5x
  assert(!rules(base({ daily: days(7, 40, 200) })).some((r) => r.startsWith("R9"))); // 5x
  assert(!rules(base({ daily: days(1, 40, 0) })).some((r) => r.startsWith("R9"))); // R$ 40 < R$ 50
});

Deno.test("R8: so conta mudanca fora da API nas ultimas 24h", () => {
  const recent = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
  const old = new Date(NOW.getTime() - 48 * 3_600_000).toISOString();
  const f = runExtraDiagnosis(base({ changes: [
    { changed_at: recent, client_type: "GOOGLE_ADS_WEB_CLIENT", resource_type: "AD_GROUP_CRITERION", user_email: "a@b.com" },
    { changed_at: recent, client_type: "GOOGLE_ADS_API", resource_type: "CAMPAIGN", user_email: "a@b.com" },
    { changed_at: old, client_type: "GOOGLE_ADS_WEB_CLIENT", resource_type: "CAMPAIGN", user_email: "a@b.com" },
  ] })).find((x) => x.rule === "R8")!;
  assertEquals(f.payload.count, 1);
  assertEquals(runExtraDiagnosis(base({ changes: [{ changed_at: old, client_type: "GOOGLE_ADS_WEB_CLIENT", resource_type: "CAMPAIGN", user_email: null }] })).length, 0);
});

Deno.test("R10: ritmo precisa de 3+ dias com gasto; media acima de 1,3x ou abaixo de 0,4x do orcamento", () => {
  assert(rules(base({ daily: days(7, 10, 80) })).includes("R10:low"));     // 10 < 16
  assert(rules(base({ daily: days(7, 60, 480) })).includes("R10:medium")); // 60 > 52
  assert(!rules(base({ daily: days(7, 40, 320) })).some((r) => r.startsWith("R10")));
  assert(!rules(base({ daily: days(2, 5, 40) })).some((r) => r.startsWith("R10")));
});

Deno.test("R11: reprovado em campanha ligada; high se nao ha aprovado, medium se ha; ignora pausada", () => {
  const camps = [
    { campaign_id: 1, name: "A", status: "ENABLED", daily_budget_micros: 10e6 }, { campaign_id: 2, name: "B", status: "ENABLED", daily_budget_micros: 10e6 },
    { campaign_id: 3, name: "C", status: "PAUSED", daily_budget_micros: 10e6 },
  ];
  const ads = [
    { campaign_id: 1, status: "ENABLED", approval_status: "DISAPPROVED" },
    { campaign_id: 2, status: "ENABLED", approval_status: "DISAPPROVED" }, { campaign_id: 2, status: "ENABLED", approval_status: "APPROVED" },
    { campaign_id: 3, status: "ENABLED", approval_status: "DISAPPROVED" },
  ];
  const f = runExtraDiagnosis(base({ campaigns: camps, ads }));
  assertEquals(f.map((x) => x.dedupe_key + ":" + x.severity).sort(), ["R11:a1:1:high", "R11:a1:2:medium"]);
});
