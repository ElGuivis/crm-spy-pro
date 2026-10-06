// Testes unitários dos guards de autenticação (_shared/auth-guard.ts): sem rede e sem funções publicadas.
// Cobrem o que protege as funções internas (cron/worker) e o isolamento entre tenants.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertTenantMatch, requireInternalAuth, requireUserAuth, requireUserOrInternalAuth } from "../_shared/auth-guard.ts";

const SERVICE = "service-role-key-for-tests";
const CRON = "cron-secret-for-tests";

/** Roda o corpo com as variáveis de ambiente dadas (undefined = apagar) e restaura no fim. */
async function withEnv(env: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    before[k] = Deno.env.get(k);
    if (env[k] === undefined) Deno.env.delete(k); else Deno.env.set(k, env[k]!);
  }
  try { await fn(); } finally {
    for (const k of Object.keys(env)) { if (before[k] === undefined) Deno.env.delete(k); else Deno.env.set(k, before[k]!); }
  }
}

const req = (headers: Record<string, string> = {}) => new Request("https://api.example.com/functions/v1/x", { method: "POST", headers });

/** Espera que o guard lance uma Response com o status dado. */
function expectStatus(fn: () => unknown, status: number) {
  try { fn(); } catch (e) {
    assert(e instanceof Response, "deveria lançar Response");
    assertEquals((e as Response).status, status);
    return;
  }
  throw new Error(`deveria ter lançado ${status}`);
}

const env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: CRON, SUPABASE_URL: "https://api.example.com", SUPABASE_ANON_KEY: "anon" };

Deno.test("requireInternalAuth: aceita service_role no Bearer", () => withEnv(env, () => requireInternalAuth(req({ Authorization: `Bearer ${SERVICE}` }))));
Deno.test("requireInternalAuth: aceita CRON_SECRET no Bearer", () => withEnv(env, () => requireInternalAuth(req({ Authorization: `Bearer ${CRON}` }))));
Deno.test("requireInternalAuth: aceita CRON_SECRET no x-cron-secret", () => withEnv(env, () => requireInternalAuth(req({ "x-cron-secret": CRON }))));

Deno.test("requireInternalAuth: recusa sem cabeçalho", () => withEnv(env, () => expectStatus(() => requireInternalAuth(req()), 401)));
Deno.test("requireInternalAuth: recusa token errado e Bearer vazio", () => withEnv(env, () => {
  expectStatus(() => requireInternalAuth(req({ Authorization: "Bearer outro-token" })), 401);
  expectStatus(() => requireInternalAuth(req({ Authorization: "Bearer " })), 401);
  expectStatus(() => requireInternalAuth(req({ "x-cron-secret": "errado" })), 401);
}));
Deno.test("requireInternalAuth: JWT de usuário não vale como interno", () => withEnv(env, () => expectStatus(() => requireInternalAuth(req({ Authorization: "Bearer eyJhbGciOi.fake.jwt" })), 401)));

// Falha segura: variável de ambiente ausente nunca pode virar "acesso liberado" (undefined === undefined)
Deno.test("requireInternalAuth: sem SUPABASE_SERVICE_ROLE_KEY no ambiente, requisição sem cabeçalho é recusada", () =>
  withEnv({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, () => expectStatus(() => requireInternalAuth(req()), 401)));
Deno.test("requireInternalAuth: CRON_SECRET vazio ou ausente nunca autoriza", () => {
  return withEnv({ ...env, CRON_SECRET: "" }, () => {
    expectStatus(() => requireInternalAuth(req({ "x-cron-secret": "" })), 401);
    expectStatus(() => requireInternalAuth(req({ Authorization: "Bearer " })), 401);
  });
});

Deno.test("requireUserAuth: sem Bearer devolve 401 sem consultar nada", async () => {
  await withEnv(env, async () => {
    const e = await assertRejects(() => requireUserAuth(req()));
    assert(e instanceof Response);
    assertEquals((e as Response).status, 401);
    const e2 = await assertRejects(() => requireUserAuth(req({ Authorization: "Basic abc" })));
    assertEquals((e2 as Response).status, 401);
  });
});

Deno.test("requireUserOrInternalAuth: chamada interna passa sem usuário", async () => {
  await withEnv(env, async () => {
    const r = await requireUserOrInternalAuth(req({ Authorization: `Bearer ${SERVICE}` }));
    assertEquals(r.isInternal, true);
    assertEquals(r.userId, undefined);
    const r2 = await requireUserOrInternalAuth(req({ "x-cron-secret": CRON }));
    assertEquals(r2.isInternal, true);
  });
});
Deno.test("requireUserOrInternalAuth: sem credencial é recusada; sem SERVICE_ROLE no ambiente também", async () => {
  await withEnv(env, async () => { assertEquals(((await assertRejects(() => requireUserOrInternalAuth(req()))) as Response).status, 401); });
  await withEnv({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    assertEquals(((await assertRejects(() => requireUserOrInternalAuth(req()))) as Response).status, 401);
  });
});

Deno.test("assertTenantMatch: mesmo tenant e corpo sem tenant passam; outro tenant dá 403", () => {
  assertTenantMatch("t1", "t1", req());
  assertTenantMatch("t1", undefined, req());
  expectStatus(() => assertTenantMatch("t1", "t2", req()), 403);
});
