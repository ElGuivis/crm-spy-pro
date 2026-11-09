import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearTokenCache, type GoogleAdsCredentials } from "../_shared/google-ads-api.ts";
import { applyChange, checkGuardrails, orderPlan, type GuardInput } from "../_shared/google-ads-apply-core.ts";

const R = (v: number) => v * 1_000_000;
const CREDS: GoogleAdsCredentials = { developerToken: "d", clientId: "c", clientSecret: "s", refreshToken: "r", loginCustomerId: "9667440809" };

const base: GuardInput = {
  kind: "adjust_budget", mode: "approval", monthlyCapMicros: R(2000), newBudgetMicros: R(20),
  current: { status: "ENABLED", budgetMicros: R(10), shared: false }, otherEnabledBudgetsMicros: R(30),
};

Deno.test("guardrails: aprova mudanca dentro do teto", () => assertEquals(checkGuardrails(base), { ok: true }));

Deno.test("guardrails: read_only recusa tudo, ate pausar", () => {
  assert(!checkGuardrails({ ...base, mode: "read_only" }).ok);
  assert(!checkGuardrails({ ...base, mode: "read_only", kind: "pause_campaign", newBudgetMicros: null }).ok);
});

Deno.test("guardrails: pausar e sempre permitido (em approval), mesmo sem teto", () => {
  assertEquals(checkGuardrails({ ...base, kind: "pause_campaign", newBudgetMicros: null, monthlyCapMicros: null }), { ok: true });
});

Deno.test("guardrails: sem teto mensal, recusa orcamento; orcamento compartilhado, recusa; removida, recusa", () => {
  assert(!checkGuardrails({ ...base, monthlyCapMicros: null }).ok);
  assert(!checkGuardrails({ ...base, current: { ...base.current, shared: true } }).ok);
  assert(!checkGuardrails({ ...base, current: { ...base.current, status: "REMOVED" } }).ok);
});

Deno.test("guardrails: soma dos orcamentos diarios nao pode passar do teto mensal", () => {
  // teto 2000/mes = 65,78/dia. outras 30 + 40 = 70/dia -> estoura.
  const r = checkGuardrails({ ...base, newBudgetMicros: R(40), current: { ...base.current, budgetMicros: R(30) } });
  assert(!r.ok && r.error.includes("acima do teto"));
  // 30 + 35 = 65 -> cabe
  assertEquals(checkGuardrails({ ...base, newBudgetMicros: R(35), current: { ...base.current, budgetMicros: R(30) } }), { ok: true });
});

Deno.test("guardrails: aumento de mais de 150% numa campanha ligada e recusado; em pausada nao se aplica; limite absoluto", () => {
  const big = checkGuardrails({ ...base, otherEnabledBudgetsMicros: 0, newBudgetMicros: R(26) });
  assert(!big.ok && big.error.includes("150%"));
  assertEquals(checkGuardrails({ ...base, otherEnabledBudgetsMicros: 0, newBudgetMicros: R(26), current: { status: "PAUSED", budgetMicros: R(10), shared: false } }), { ok: true });
  assert(!checkGuardrails({ ...base, monthlyCapMicros: R(1_000_000), otherEnabledBudgetsMicros: 0, newBudgetMicros: R(1500), current: { status: "PAUSED", budgetMicros: R(10), shared: false } }).ok);
  assert(!checkGuardrails({ ...base, newBudgetMicros: 500_000 }).ok);
});

Deno.test("orderPlan: pausar primeiro, depois reduzir, depois aumentar/ligar", () => {
  const cur = new Map<number, number | null>([[1, R(400)], [2, R(10)], [3, null]]);
  const items = [
    { kind: "enable_campaign", payload: { campaign_id: 3, daily_budget_micros: R(17) } },
    { kind: "adjust_budget", payload: { campaign_id: 2, daily_budget_micros: R(18) } },
    { kind: "adjust_budget", payload: { campaign_id: 1, daily_budget_micros: R(11) } },
    { kind: "pause_campaign", payload: { campaign_id: 9 } },
  ];
  assertEquals(orderPlan(items, cur).map((i) => i.payload.campaign_id), [9, 1, 3, 2]);
});

// ---- fluxo completo com Google e banco falsos ----
function fakeDb(account: Record<string, unknown>, enabled: Array<{ campaign_id: number; daily_budget_micros: number }>) {
  const writes: Record<string, unknown[]> = {};
  const rec = (k: string, v: unknown) => (writes[k] ??= []).push(v);
  const client = {
    from(table: string) {
      return {
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: table === "google_ads_accounts" ? account : null, error: null }),
            then: (res: (v: unknown) => unknown) => res({ data: enabled, error: null }),
          };
          return chain;
        },
        update: (row: unknown) => { rec(`${table}:update`, row); return { eq: () => ({ eq: () => Promise.resolve({ error: null }), then: (r: (v: unknown) => unknown) => r({ error: null }) }) }; },
        insert: (row: unknown) => { rec(`${table}:insert`, row); return Promise.resolve({ error: null }); },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, writes };
}
const ACCOUNT = { id: "a1", customer_id: "5220063897", login_customer_id: "9667440809", mode: "approval", guardrails: { monthly_budget_cap_micros: R(2000) } };
const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function withGoogle(state: { status: string; amount: number }, onMutate: (url: string, body: Record<string, unknown>) => Response | void, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2")) return Promise.resolve(jsonRes({ access_token: "at", expires_in: 3600 }));
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("googleAds:search")) {
      return Promise.resolve(jsonRes({ results: [{ campaign: { id: "7", status: state.status, campaignBudget: "customers/5220063897/campaignBudgets/55" }, campaignBudget: { amountMicros: String(state.amount), explicitlyShared: false } }] }));
    }
    const custom = onMutate(url, body);
    if (custom) return Promise.resolve(custom);
    const op = body.operations[0].update;
    if (url.includes("campaignBudgets")) state.amount = Number(op.amountMicros);
    if (url.includes("campaigns:mutate")) state.status = op.status;
    return Promise.resolve(jsonRes({ results: [{}] }));
  }) as typeof fetch;
  clearTokenCache();
  try { await fn(); } finally { globalThis.fetch = original; clearTokenCache(); }
}

Deno.test("applyChange: reduz orcamento, le de novo, confirma e grava auditoria com antes/depois", async () => {
  const { client, writes } = fakeDb(ACCOUNT, [{ campaign_id: 7, daily_budget_micros: R(190) }, { campaign_id: 8, daily_budget_micros: R(20) }]);
  const mutations: string[] = [];
  await withGoogle({ status: "ENABLED", amount: R(190) }, (url, b) => { mutations.push(`${url.split("/").pop()}:${JSON.stringify(b.operations)}`); }, async () => {
    const r = await applyChange(client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", kind: "adjust_budget", campaignId: 7, newBudgetMicros: R(25) });
    assertEquals(r.ok, true);
    assertEquals(r.before, { status: "ENABLED", daily_budget_micros: R(190) });
    assertEquals(r.after, { status: "ENABLED", daily_budget_micros: R(25) });
  });
  assertEquals(mutations.length, 1);
  assert(mutations[0].startsWith("campaignBudgets:mutate"));
  assert(mutations[0].includes('"updateMask":"amount_micros"') && mutations[0].includes("campaignBudgets/55"));
  const audit = writes["google_ads_audit_log:insert"][0] as Record<string, unknown>;
  assertEquals(audit.action, "apply");
  assertEquals(audit.entity, "campaign:7");
});

Deno.test("applyChange: modo read_only -> nada e enviado ao Google", async () => {
  const { client } = fakeDb({ ...ACCOUNT, mode: "read_only" }, []);
  let mutated = false;
  await withGoogle({ status: "ENABLED", amount: R(190) }, () => { mutated = true; }, async () => {
    const r = await applyChange(client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", kind: "pause_campaign", campaignId: 7, newBudgetMicros: null });
    assertEquals(r.ok, false);
    assert(r.error!.includes("somente leitura"));
  });
  assertEquals(mutated, false);
});

Deno.test("applyChange: o Google recusa -> erro claro, nada gravado como aplicado, orcamento nao e deixado pela metade", async () => {
  const { client, writes } = fakeDb(ACCOUNT, [{ campaign_id: 7, daily_budget_micros: R(0) }]);
  const calls: string[] = [];
  await withGoogle({ status: "PAUSED", amount: R(10) }, (url) => {
    calls.push(url.split("/").pop()!);
    if (url.includes("campaigns:mutate")) return jsonRes({ error: { message: "campanha nao pode ser ativada", status: "FAILED_PRECONDITION" } }, 400);
  }, async () => {
    const r = await applyChange(client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", kind: "enable_campaign", campaignId: 7, newBudgetMicros: R(15) });
    assertEquals(r.ok, false);
    assert(r.error!.includes("recusou"));
  });
  // 1) orcamento, 2) tentou ligar e falhou, 3) devolveu o orcamento ao valor antigo
  assertEquals(calls, ["campaignBudgets:mutate", "campaigns:mutate", "campaignBudgets:mutate"]);
  assertEquals(writes["google_ads_audit_log:insert"], undefined);
});

Deno.test("applyChange: se o valor lido depois nao bate, nao diz que deu certo", async () => {
  const { client } = fakeDb(ACCOUNT, []);
  await withGoogle({ status: "ENABLED", amount: R(40) }, (url) => { if (url.includes("campaignBudgets")) return jsonRes({ results: [{}] }); }, async () => {
    // mutate "funciona" mas o estado nao muda (state nao e atualizado porque o handler customizado respondeu)
    const r = await applyChange(client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", kind: "adjust_budget", campaignId: 7, newBudgetMicros: R(30) });
    assertEquals(r.ok, false);
    assert(r.error!.includes("nao bate"));
  });
});
