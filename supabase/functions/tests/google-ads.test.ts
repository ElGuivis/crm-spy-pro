import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearTokenCache,
  describeApiError,
  getAccessToken,
  gaqlSearch,
  GoogleAdsApiError,
  loadCredentials,
  type GoogleAdsCredentials,
} from "../_shared/google-ads-api.ts";
import { dateRange, mapAccountBudgetRow, mapCampaignRow, mapDailyRow, pickBillingStatus, syncAccount, toDate } from "../_shared/google-ads-sync-core.ts";

const CREDS: GoogleAdsCredentials = {
  developerToken: "dev-token",
  clientId: "cid",
  clientSecret: "csecret",
  refreshToken: "rtoken",
  loginCustomerId: "9667440809",
};

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Troca o fetch global por um roteador de teste e restaura no fim. */
async function withFetch(handler: Handler, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {}))) as typeof fetch;
  clearTokenCache();
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
    clearTokenCache();
  }
}

Deno.test("loadCredentials: lista os secrets ausentes sem mostrar valores", () => {
  for (const k of ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"]) {
    Deno.env.delete(k);
  }
  Deno.env.set("GOOGLE_ADS_CLIENT_ID", "abc");
  const err = assertThrows(() => loadCredentials(), GoogleAdsApiError);
  assertEquals(err.code, "MISSING_SECRETS");
  assertEquals(err.message.includes("GOOGLE_ADS_DEVELOPER_TOKEN"), true);
  assertEquals(err.message.includes("abc"), false);
  Deno.env.delete("GOOGLE_ADS_CLIENT_ID");
});

Deno.test("loadCredentials: normaliza o login_customer_id (so digitos)", () => {
  Deno.env.set("GOOGLE_ADS_DEVELOPER_TOKEN", "d");
  Deno.env.set("GOOGLE_ADS_CLIENT_ID", "c");
  Deno.env.set("GOOGLE_ADS_CLIENT_SECRET", "s");
  Deno.env.set("GOOGLE_ADS_REFRESH_TOKEN", "r");
  assertEquals(loadCredentials("966-744-0809").loginCustomerId, "9667440809");
  assertEquals(loadCredentials(null).loginCustomerId, undefined);
  for (const k of ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN"]) {
    Deno.env.delete(k);
  }
});

Deno.test("getAccessToken: renova uma vez e usa o cache", async () => {
  let calls = 0;
  await withFetch(() => { calls++; return jsonRes({ access_token: "at1", expires_in: 3600 }); }, async () => {
    assertEquals(await getAccessToken(CREDS), "at1");
    assertEquals(await getAccessToken(CREDS), "at1");
    assertEquals(calls, 1);
  });
});

Deno.test("getAccessToken: invalid_grant vira INVALID_GRANT", async () => {
  await withFetch(() => jsonRes({ error: "invalid_grant", error_description: "revoked" }, 400), async () => {
    const err = await assertRejects(() => getAccessToken(CREDS), GoogleAdsApiError);
    assertEquals(err.code, "INVALID_GRANT");
  });
});

Deno.test("gaqlSearch: pagina, envia os cabecalhos certos e junta as linhas", async () => {
  const seen: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  await withFetch((url, init) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    const body = JSON.parse(String(init.body));
    seen.push({ url, headers: init.headers as Record<string, string>, body });
    return body.pageToken
      ? jsonRes({ results: [{ campaign: { id: "2" } }] })
      : jsonRes({ results: [{ campaign: { id: "1" } }], nextPageToken: "p2" });
  }, async () => {
    const rows = await gaqlSearch(CREDS, "5220063897", "SELECT campaign.id FROM campaign");
    assertEquals(rows.map((r) => r.campaign.id), ["1", "2"]);
    assertEquals(seen.length, 2);
    assertEquals(seen[0].url.includes("/customers/5220063897/googleAds:search"), true);
    assertEquals(seen[0].headers["developer-token"], "dev-token");
    assertEquals(seen[0].headers["login-customer-id"], "9667440809");
    assertEquals(seen[0].headers.Authorization, "Bearer at");
    assertEquals(seen[1].body.pageToken, "p2");
  });
});

Deno.test("gaqlSearch: repete em 429 e depois funciona", async () => {
  let attempts = 0;
  await withFetch((url) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    attempts++;
    return attempts < 2 ? jsonRes({ error: { message: "rate" } }, 429) : jsonRes({ results: [] });
  }, async () => {
    assertEquals(await gaqlSearch(CREDS, "5220063897", "SELECT campaign.id FROM campaign"), []);
    assertEquals(attempts, 2);
  });
});

Deno.test("gaqlSearch: erro 403 nao repete e traz o codigo do Google", async () => {
  let attempts = 0;
  await withFetch((url) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    attempts++;
    return jsonRes({ error: { message: "x", details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" }, message: "sem permissao" }] }] } }, 403);
  }, async () => {
    const err = await assertRejects(() => gaqlSearch(CREDS, "5220063897", "q"), GoogleAdsApiError);
    assertEquals(err.code, "USER_PERMISSION_DENIED");
    assertEquals(err.message, "sem permissao");
    assertEquals(attempts, 1);
  });
});

Deno.test("gaqlSearch: customer_id fora do formato e recusado antes de chamar a rede", async () => {
  await assertRejects(() => gaqlSearch(CREDS, "522-006-3897", "q"), GoogleAdsApiError, "customer_id invalido");
});

Deno.test("describeApiError: usa fallback quando o corpo nao e o padrao", () => {
  assertEquals(describeApiError({}).message, "Erro desconhecido da Google Ads API");
  assertEquals(describeApiError({ error: { message: "m", status: "PERMISSION_DENIED" } }), { message: "m", code: "PERMISSION_DENIED" });
});

Deno.test("toDate: aceita data e data+hora; 2037-12-30 (sem fim) vira null", () => {
  assertEquals(toDate("2026-11-09"), "2026-11-09");
  assertEquals(toDate("2026-11-09 03:00:00"), "2026-11-09");
  assertEquals(toDate("2037-12-30"), null);
  assertEquals(toDate(""), null);
  assertEquals(toDate(undefined), null);
});

Deno.test("dateRange: cobre N dias incluindo hoje e limita a 1..365", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  assertEquals(dateRange(30, now), { start: "2026-10-11", end: "2026-11-09" });
  assertEquals(dateRange(1, now), { start: "2026-11-09", end: "2026-11-09" });
  assertEquals(dateRange(9999, now).start, "2025-11-10");
  assertEquals(dateRange(0, now).start, "2026-10-11"); // 0/invalido cai no padrao de 30 dias
});

Deno.test("mapCampaignRow: converte o formato REST do Google", () => {
  const row = {
    campaign: { id: "14584011349", name: "PMax", status: "PAUSED", advertisingChannelType: "PERFORMANCE_MAX", biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE", startDateTime: "2023-05-01 00:00:00", endDateTime: "2037-12-30 23:59:59" },
    campaignBudget: { amountMicros: "20000000" },
  };
  const m = mapCampaignRow(row, "t1", "a1");
  assertEquals(m.campaign_id, 14584011349);
  assertEquals(m.daily_budget_micros, 20000000);
  assertEquals(m.end_date, null);
  assertEquals(m.start_date, "2023-05-01");
  assertEquals(m.channel_type, "PERFORMANCE_MAX");
  assertEquals(mapCampaignRow({ campaign: { id: "1" } }, "t", "a").daily_budget_micros, null);
});

Deno.test("mapDailyRow: converte micros e numeros em texto", () => {
  const row = {
    campaign: { id: "7" },
    segments: { date: "2026-11-08" },
    metrics: { impressions: "1200", clicks: "30", costMicros: "45500000", conversions: 2.5, conversionsValue: 310.4 },
  };
  const mapped = mapDailyRow(row, "t1", "a1");
  assertEquals(mapped, {
    tenant_id: "t1", account_id: "a1", campaign_id: 7, date: "2026-11-08",
    impressions: 1200, clicks: 30, cost_micros: 45500000, conversions: 2.5, conversions_value: 310.4,
    synced_at: mapped.synced_at,
  });
});

/** Banco falso que guarda o que foi gravado. */
function fakeSupabase() {
  const writes: Record<string, unknown[][]> = {};
  const record = (t: string, rows: unknown) => { (writes[t] ??= []).push(Array.isArray(rows) ? rows : [rows]); };
  const client = {
    from(table: string) {
      return {
        upsert(rows: unknown) { record(`${table}:upsert`, rows); return Promise.resolve({ error: null }); },
        insert(rows: unknown) { record(`${table}:insert`, rows); return Promise.resolve({ error: null }); },
        update(row: unknown) { record(`${table}:update`, row); return { eq: () => Promise.resolve({ error: null }) }; },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, writes };
}

const ACCOUNT = { id: "a1", tenant_id: "t1", customer_id: "5220063897", login_customer_id: "9667440809" };

Deno.test("syncAccount: grava campanhas, metricas, metadados e auditoria", async () => {
  const { client, writes } = fakeSupabase();
  await withFetch((url, init) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    const q: string = JSON.parse(String(init.body)).query;
    if (q.includes("conversion_action_name")) return jsonRes({ results: [] });
    if (q.includes("FROM customer")) return jsonRes({ results: [{ customer: { descriptiveName: "Chronic", currencyCode: "BRL", timeZone: "America/Sao_Paulo", status: "ENABLED" } }] });
    if (q.includes("FROM billing_setup")) return jsonRes({ results: [{ billingSetup: { status: "APPROVED" } }] });
    if (q.includes("FROM account_budget")) return jsonRes({ results: [{ accountBudget: { resourceName: "customers/5220063897/accountBudgets/6607136390", status: "APPROVED", approvedSpendingLimitMicros: "131470090000", adjustedSpendingLimitMicros: "131520330000", amountServedMicros: "131520330000", approvedStartDateTime: "2021-07-06 13:44:45" } }] });
    if (q.includes("segments.date")) return jsonRes({ results: [{ campaign: { id: "7" }, segments: { date: "2026-11-08" }, metrics: { impressions: "10", clicks: "1", costMicros: "1000000", conversions: 0, conversionsValue: 0 } }] });
    return jsonRes({ results: [{ campaign: { id: "7", name: "Teste", status: "ENABLED" } }] });
  }, async () => {
    const r = await syncAccount(client, ACCOUNT, CREDS, { days: 7, actor: "system" });
    assertEquals({ ...r, start: undefined, end: undefined }, { account_id: "a1", customer_id: "5220063897", ok: true, campaigns: 1, daily_rows: 1, days: 7, start: undefined, end: undefined });
    assertEquals(writes["google_ads_campaigns:upsert"].length, 1);
    assertEquals(writes["google_ads_campaign_daily:upsert"].length, 1);
    const upd = writes["google_ads_accounts:update"][0][0] as Record<string, unknown>;
    assertEquals(upd.descriptive_name, "Chronic");
    assertEquals(upd.last_error, null);
    assertEquals(upd.customer_status, "ENABLED");
    assertEquals(upd.billing_status, "APPROVED");
    const budgetRow = writes["google_ads_account_budget:upsert"][0][0] as Record<string, unknown>;
    assertEquals(budgetRow.account_budget_id, 6607136390);
    assertEquals(budgetRow.amount_served_micros, 131520330000);
    assertEquals(budgetRow.adjusted_spending_limit_micros, 131520330000);
    const audit = writes["google_ads_audit_log:insert"][0][0] as Record<string, unknown>;
    assertEquals(audit.action, "sync");
    assertEquals(audit.actor, "system");
  });
});

Deno.test("syncAccount: erro do Google nao derruba; fica em last_error e nada e gravado", async () => {
  const { client, writes } = fakeSupabase();
  await withFetch((url) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    return jsonRes({ error: { message: "token nao aprovado", details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "token nao aprovado" }] }] } }, 403);
  }, async () => {
    const r = await syncAccount(client, ACCOUNT, CREDS, { actor: "system" });
    assertEquals(r.ok, false);
    assertEquals(r.error, "token nao aprovado");
    assertEquals(writes["google_ads_campaigns:upsert"], undefined);
    assertEquals((writes["google_ads_accounts:update"][0][0] as Record<string, unknown>).last_error, "token nao aprovado");
  });
});

Deno.test("mapCampaignRow: guarda status de entrega e motivos brutos (UNKNOWN incluso)", () => {
  const m = mapCampaignRow({ campaign: { id: "1", name: "x", status: "ENABLED", servingStatus: "SUSPENDED", primaryStatus: "LIMITED", primaryStatusReasons: ["UNKNOWN", "UNKNOWN"] } }, "t", "a");
  assertEquals(m.serving_status, "SUSPENDED");
  assertEquals(m.primary_status, "LIMITED");
  assertEquals(m.primary_status_reasons, ["UNKNOWN", "UNKNOWN"]);
  assertEquals(mapCampaignRow({ campaign: { id: "1" } }, "t", "a").primary_status_reasons, []);
});

Deno.test("mapAccountBudgetRow e pickBillingStatus: formato REST real", () => {
  const b = mapAccountBudgetRow({ accountBudget: { resourceName: "customers/5220063897/accountBudgets/6607136390", status: "APPROVED", approvedStartDateTime: "2021-07-06 13:44:45", approvedSpendingLimitMicros: "131470090000", amountServedMicros: "131520330000" } }, "t", "a");
  assertEquals(b.account_budget_id, 6607136390);
  assertEquals(b.adjusted_spending_limit_micros, null);
  assertEquals(b.approved_end_date_time, null);
  assertEquals(b.approved_start_date_time, "2021-07-06 13:44:45");
  assertEquals(pickBillingStatus([]), null);
  assertEquals(pickBillingStatus([{ billingSetup: { status: "CANCELLED" } }, { billingSetup: { status: "APPROVED" } }]), "APPROVED");
  assertEquals(pickBillingStatus([{ billingSetup: { status: "PENDING" } }]), "PENDING");
});

Deno.test("syncAccount: 403 nas consultas opcionais (faturamento/limite) vira aviso e a sincronizacao segue; 400 derruba", async () => {
  const route = (denyCode: number) => (url: string, init: RequestInit) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    const q: string = JSON.parse(String(init.body)).query;
    if (q.includes("FROM billing_setup") || q.includes("FROM account_budget")) return jsonRes({ error: { message: "negado" } }, denyCode);
    if (q.includes("FROM customer")) return jsonRes({ results: [{ customer: { status: "ENABLED" } }] });
    return jsonRes({ results: [] });
  };
  const a = fakeSupabase();
  await withFetch(route(403), async () => {
    const r = await syncAccount(a.client, ACCOUNT, CREDS, { actor: "system" });
    assertEquals(r.ok, true);
    const audit = a.writes["google_ads_audit_log:insert"][0][0] as { after_state: { warnings: string[] } };
    assertEquals(audit.after_state.warnings.length, 2);
  });
  const b = fakeSupabase();
  await withFetch(route(400), async () => {
    const r = await syncAccount(b.client, ACCOUNT, CREDS, { actor: "system" });
    assertEquals(r.ok, false); // consulta malformada NAO pode ser engolida em silencio
  });
});

Deno.test("syncAccount: janela historica (end_date) + acoes de conversao e conversoes por mes agregadas", async () => {
  const { client, writes } = fakeSupabase();
  const queries: string[] = [];
  await withFetch((url, init) => {
    if (url.includes("oauth2")) return jsonRes({ access_token: "at", expires_in: 3600 });
    const q: string = JSON.parse(String(init.body)).query;
    queries.push(q);
    if (q.includes("conversion_action_name")) {
      return jsonRes({ results: [
        { segments: { month: "2023-06-01", conversionActionName: "Compra" }, metrics: { conversions: 2, conversionsValue: 100 } },
        { segments: { month: "2023-06-01", conversionActionName: "Compra" }, metrics: { conversions: 1, conversionsValue: 50 } },
        { segments: { month: "2023-06-01", conversionActionName: "Ligacao" }, metrics: { conversions: 5, conversionsValue: 0 } },
      ] });
    }
    if (q.includes("FROM conversion_action")) return jsonRes({ results: [{ conversionAction: { id: "99", name: "Compra", status: "ENABLED", type: "WEBPAGE", category: "PURCHASE", primaryForGoal: true, includeInConversionsMetric: true } }] });
    if (q.includes("FROM customer")) return jsonRes({ results: [{ customer: { descriptiveName: "C" } }] });
    return jsonRes({ results: [] });
  }, async () => {
    const r = await syncAccount(client, ACCOUNT, CREDS, { days: 31, endDate: "2023-06-30", actor: "system" });
    assertEquals(r.ok, true);
    assertEquals(r.start, "2023-05-31");
    assertEquals(r.end, "2023-06-30");
    assert(queries.some((q) => q.includes("BETWEEN '2023-05-31' AND '2023-06-30'")));
    const conv = writes["google_ads_conversion_monthly:upsert"][0] as Record<string, unknown>[];
    assertEquals(conv.length, 2);
    const compra = conv.find((c) => c.conversion_action_name === "Compra")!;
    assertEquals([compra.conversions, compra.conversions_value, compra.month], [3, 150, "2023-06-01"]);
    const act = writes["google_ads_conversion_actions:upsert"][0][0] as Record<string, unknown>;
    assertEquals([act.conversion_action_id, act.category, act.primary_for_goal], [99, "PURCHASE", true]);
  });
});
