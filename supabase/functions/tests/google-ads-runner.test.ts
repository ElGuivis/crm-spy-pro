import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diagnoseAccount } from "../_shared/google-ads-diagnosis-runner.ts";
import { MAX_MONTHLY_CAP_BRL, parseMonthlyCap } from "../_shared/google-ads-settings-core.ts";

type Row = Record<string, unknown>;

/** Banco falso em memoria: select/eq/gte/not/limit, insert e update().eq(). Suficiente para o runner. */
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  class Q implements PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
    private filters: Array<(r: Row) => boolean> = [];
    private mode: "select" | "update" | "insert" = "select";
    private patch: Row = {};
    private rowsToInsert: Row[] = [];
    constructor(private table: string) {}
    select(_cols?: string) { return this; }
    eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
    gte(col: string, v: string) { this.filters.push((r) => String(r[col]) >= v); return this; }
    not(col: string, op: string, v: unknown) { if (op === "is" && v === null) this.filters.push((r) => r[col] != null); return this; }
    limit(_n: number) { return this; }
    insert(rows: Row | Row[]) { this.mode = "insert"; this.rowsToInsert = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch: Row) { this.mode = "update"; this.patch = patch; return this; }
    // deno-lint-ignore no-explicit-any
    then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      const t = (tables[this.table] ??= []);
      let res: { data: Row[] | null; error: null };
      if (this.mode === "insert") {
        for (const r of this.rowsToInsert) t.push({ id: `row${++seq}`, ...r });
        res = { data: null, error: null };
      } else if (this.mode === "update") {
        for (const r of t.filter((x) => this.filters.every((f) => f(x)))) Object.assign(r, this.patch);
        res = { data: null, error: null };
      } else {
        res = { data: t.filter((x) => this.filters.every((f) => f(x))).map((x) => ({ ...x })), error: null };
      }
      return Promise.resolve(res).then(ok, bad);
    }
  }
  // deno-lint-ignore no-explicit-any
  return { client: { from: (t: string) => new Q(t) } as any, tables };
}

const NOW = new Date("2026-11-09T12:00:00Z");
const R = (n: number) => Math.round(n * 1e6);
const ACC = "acc1";

function world(over: { served?: number; serving?: string; cap?: number } = {}) {
  return fakeDb({
    google_ads_accounts: [{
      id: ACC, tenant_id: "t1", customer_status: "ENABLED", billing_status: "APPROVED",
      last_synced_at: "2026-11-09T11:00:00Z", guardrails: over.cap ? { monthly_budget_cap_micros: over.cap } : {},
    }],
    google_ads_campaigns: [
      { account_id: ACC, campaign_id: 1, name: "PMax", status: "ENABLED", serving_status: over.serving ?? "SUSPENDED", daily_budget_micros: R(400) },
      { account_id: ACC, campaign_id: 2, name: "Marca", status: "ENABLED", serving_status: over.serving ?? "SUSPENDED", daily_budget_micros: R(190) },
    ],
    google_ads_account_budget: [{ account_id: ACC, status: "APPROVED", approved_spending_limit_micros: R(131470.09), adjusted_spending_limit_micros: R(131520.33), amount_served_micros: over.served ?? R(131520.33) }],
    google_ads_campaign_daily: [],
    google_ads_recommendations: [],
    google_ads_audit_log: [],
  });
}
const recs = (db: ReturnType<typeof fakeDb>) => db.tables.google_ads_recommendations;

Deno.test("runner: estado real cria os alertas R1 (critico) e R7 (teto mensal) uma unica vez", async () => {
  const db = world({ cap: R(1000) });
  const r = await diagnoseAccount(db.client, ACC, "system", NOW);
  assertEquals(r.ok, true);
  assertEquals(r.created, 2);
  assertEquals(recs(db).map((x) => x.dedupe_key).sort(), ["R1:acc1", "R7:acc1"]);
  const r1 = recs(db).find((x) => x.dedupe_key === "R1:acc1")!;
  assertEquals([r1.agent, r1.status, r1.severity, r1.tenant_id], ["account_diagnosis", "pending", "critical", "t1"]);
  assertEquals(db.tables.google_ads_audit_log.length, 1);
});

Deno.test("runner: rodar de novo NAO duplica; so atualiza", async () => {
  const db = world({ cap: R(1000) });
  await diagnoseAccount(db.client, ACC, "system", NOW);
  const r = await diagnoseAccount(db.client, ACC, "system", NOW);
  assertEquals([r.created, r.updated, r.resolved], [0, 2, 0]);
  assertEquals(recs(db).length, 2);
});

Deno.test("runner: saldo reposto e campanhas voltam a entregar -> alerta R1 e auto-resolvido (expired)", async () => {
  const db = world({ cap: R(1000) });
  await diagnoseAccount(db.client, ACC, "system", NOW);
  db.tables.google_ads_account_budget[0].amount_served_micros = R(131520.33 - 5000);
  for (const c of db.tables.google_ads_campaigns) c.serving_status = "SERVING";
  const r = await diagnoseAccount(db.client, ACC, "system", NOW);
  assertEquals((r.resolved ?? 0) >= 1, true);
  assertEquals(recs(db).find((x) => x.dedupe_key === "R1:acc1")!.status, "expired");
});

Deno.test("runner: condicao que volta reabre o alerta expirado (sem criar outro)", async () => {
  const db = world();
  await diagnoseAccount(db.client, ACC, "system", NOW);
  recs(db)[0].status = "expired";
  const r = await diagnoseAccount(db.client, ACC, "system", NOW);
  assertEquals(r.reopened, 1);
  assertEquals(recs(db).length, 1);
  assertEquals(recs(db)[0].status, "pending");
});

Deno.test("runner: alerta que o usuario dispensou (rejected) continua dispensado e nao e duplicado", async () => {
  const db = world();
  await diagnoseAccount(db.client, ACC, "system", NOW);
  recs(db)[0].status = "rejected";
  const r = await diagnoseAccount(db.client, ACC, "system", NOW);
  assertEquals([r.created, r.updated, r.reopened], [0, 0, 0]);
  assertEquals(recs(db).length, 1);
  assertEquals(recs(db)[0].status, "rejected");
});

Deno.test("runner: conta inexistente devolve erro sem lancar excecao", async () => {
  const db = world();
  const r = await diagnoseAccount(db.client, "nao-existe", "system", NOW);
  assertEquals(r.ok, false);
  assertEquals(r.error, "conta nao encontrada");
});

Deno.test("parseMonthlyCap: numero, pt-BR e remocao", () => {
  assertEquals(parseMonthlyCap(1000), { ok: true, micros: 1_000_000_000 });
  assertEquals(parseMonthlyCap(1234.56), { ok: true, micros: 1_234_560_000 });
  assertEquals(parseMonthlyCap("1.500,50"), { ok: true, micros: 1_500_500_000 });
  assertEquals(parseMonthlyCap("1500,5"), { ok: true, micros: 1_500_500_000 });
  assertEquals(parseMonthlyCap("1500.50"), { ok: true, micros: 1_500_500_000 });
  assertEquals(parseMonthlyCap("1.500"), { ok: true, micros: 1_500_000_000 }); // pt-BR: mil e quinhentos
  assertEquals(parseMonthlyCap(null), { ok: true, micros: null });
  assertEquals(parseMonthlyCap(""), { ok: true, micros: null });
});

Deno.test("parseMonthlyCap: recusa formatos ambiguos, zero, negativo, absurdo e lixo (erro de digitacao custa caro)", () => {
  for (const bad of [0, -5, "0", "-10", "abc", "1.2.3", "1,000.50", "1.5000", NaN, Infinity, MAX_MONTHLY_CAP_BRL + 1, {}, [], true]) {
    assertEquals(parseMonthlyCap(bad).ok, false, `deveria recusar ${JSON.stringify(bad)}`);
  }
});
