import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearTokenCache, type GoogleAdsCredentials } from "../_shared/google-ads-api.ts";
import { applyConversionGoal, revertBuild } from "../_shared/google-ads-build-apply.ts";

const CREDS: GoogleAdsCredentials = { developerToken: "d", clientId: "c", clientSecret: "s", refreshToken: "r", loginCustomerId: "9667440809" };
const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const base = { accountId: "a1", tenantId: "t1", actor: "user:u" };
const ACC = { customer_id: "5220063897", login_customer_id: "9667440809", mode: "approval", descriptive_name: "Chronic", guardrails: {} };

function fakeDb(account: Record<string, unknown>, auditRow: Record<string, unknown> | null = null) {
  const writes: Record<string, unknown[]> = {};
  const chain = (table: string): unknown => new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => res({ data: [], error: null });
      if (prop === "maybeSingle") return () => Promise.resolve({ data: table === "google_ads_accounts" ? account : table === "google_ads_audit_log" ? auditRow : null, error: null });
      if (prop === "insert") return (row: unknown) => { (writes[`${table}:insert`] ??= []).push(row); return Promise.resolve({ error: null }); };
      return () => chain(table);
    },
  });
  // deno-lint-ignore no-explicit-any
  return { client: { from: (t: string) => chain(t) } as any, writes };
}

async function withGoogle(goals: Record<string, boolean | null>, mutations: Array<Record<string, any>>, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2")) return Promise.resolve(jsonRes({ access_token: "at", expires_in: 3600 }));
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("googleAds:search")) {
      const m = /category = '([A-Z_]+)' AND customer_conversion_goal.origin = '([A-Z_]+)'/.exec(body.query);
      const key = m ? `${m[1]}~${m[2]}` : "";
      return Promise.resolve(jsonRes({ results: key in goals ? [{ customerConversionGoal: goals[key] === null ? {} : { biddable: goals[key] } }] : [] }));
    }
    for (const op of body.operations) {
      mutations.push(op);
      const key = String(op.update.resourceName).split("/").pop()!;
      goals[key] = op.update.biddable;
    }
    return Promise.resolve(jsonRes({ results: [{}] }));
  }) as typeof fetch;
  clearTokenCache();
  try { await fn(); } finally { globalThis.fetch = original; clearTokenCache(); }
}

Deno.test("meta de conversao: desliga 'otimizar lances' do inicio do checkout, confere depois e audita o antes", async () => {
  const { client, writes } = fakeDb(ACC);
  const goals: Record<string, boolean | null> = { "BEGIN_CHECKOUT~WEBSITE": true };
  const muts: Array<Record<string, any>> = [];
  await withGoogle(goals, muts, async () => {
    const r = await applyConversionGoal(client, CREDS, { ...base, category: "BEGIN_CHECKOUT", origin: "WEBSITE" });
    assertEquals(r.ok, true);
  });
  assertEquals(muts[0].update, { resourceName: "customers/5220063897/customerConversionGoals/BEGIN_CHECKOUT~WEBSITE", biddable: false });
  assertEquals(muts[0].updateMask, "biddable");
  const a = writes["google_ads_audit_log:insert"][0] as { entity: string; before_state: { biddable: boolean }; after_state: { confirmed: boolean } };
  assertEquals([a.entity, a.before_state.biddable, a.after_state.confirmed], ["goal:BEGIN_CHECKOUT~WEBSITE", true, true]);
});

Deno.test("meta de conversao: NUNCA desliga a meta de COMPRA; nem origem estranha; nem read_only; nem se ja esta desligada", async () => {
  const muts: Array<Record<string, any>> = [];
  await withGoogle({ "PURCHASE~WEBSITE": true, "DOWNLOAD~APP": false }, muts, async () => {
    const db = fakeDb(ACC).client;
    const buy = await applyConversionGoal(db, CREDS, { ...base, category: "PURCHASE", origin: "WEBSITE" });
    assert(!buy.ok && buy.error!.includes("so as que nao sao venda"));
    assert(!(await applyConversionGoal(db, CREDS, { ...base, category: "DOWNLOAD", origin: "APP'; DROP" })).ok);
    const ro = await applyConversionGoal(fakeDb({ ...ACC, mode: "read_only" }).client, CREDS, { ...base, category: "DOWNLOAD", origin: "APP" });
    assert(!ro.ok && ro.error!.includes("somente leitura"));
    const already = await applyConversionGoal(db, CREDS, { ...base, category: "DOWNLOAD", origin: "APP" });
    assert(!already.ok && already.error!.includes("ja esta desligada"));
  });
  assertEquals(muts.length, 0);
});

Deno.test("meta com biddable nao informado (None) tambem pode ser desligada", async () => {
  const goals: Record<string, boolean | null> = { "PHONE_CALL_LEAD~CALL_FROM_ADS": null };
  const muts: Array<Record<string, any>> = [];
  await withGoogle(goals, muts, async () => {
    const r = await applyConversionGoal(fakeDb(ACC).client, CREDS, { ...base, category: "PHONE_CALL_LEAD", origin: "CALL_FROM_ADS" });
    assertEquals(r.ok, true);
  });
  assertEquals(muts.length, 1);
});

Deno.test("desfazer meta: volta 'otimizar lances' para ligado", async () => {
  const audit = { id: "x", entity: "goal:BEGIN_CHECKOUT~WEBSITE", action: "apply", before_state: { biddable: true }, after_state: { biddable: false } };
  const goals: Record<string, boolean | null> = { "BEGIN_CHECKOUT~WEBSITE": false };
  const muts: Array<Record<string, any>> = [];
  await withGoogle(goals, muts, async () => {
    const r = await revertBuild(fakeDb(ACC, audit).client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", auditId: "x" });
    assertEquals(r.ok, true);
  });
  assertEquals(goals["BEGIN_CHECKOUT~WEBSITE"], true);
});
