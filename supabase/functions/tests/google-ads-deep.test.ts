import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearTokenCache, type GoogleAdsCredentials } from "../_shared/google-ads-api.ts";
import { ALL_DATASETS, defaultWindow, PRESETS, runDeep, snapStart } from "../_shared/google-ads-deep-runner.ts";
import { mergeRows } from "../_shared/google-ads-deep-types.ts";

const CREDS: GoogleAdsCredentials = { developerToken: "d", clientId: "c", clientSecret: "s", refreshToken: "r", loginCustomerId: "9667440809" };
const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const ds = (n: string) => ALL_DATASETS.find((d) => d.name === n)!;
const ctx = { creds: CREDS, customerId: "5220063897", tenantId: "t1", accountId: "a1", start: "2025-01-01", end: "2025-12-31", lifetimeStart: "2015-01-01" };

async function withGoogle(handler: (q: string) => unknown, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("oauth2")) return Promise.resolve(jsonRes({ access_token: "at", expires_in: 3600 }));
    return Promise.resolve(jsonRes({ results: handler(JSON.parse(String(init?.body)).query) }));
  }) as typeof fetch;
  clearTokenCache();
  try { await fn(); } finally { globalThis.fetch = original; clearTokenCache(); }
}

Deno.test("snapStart: mensal -> dia 1 do mes; anual -> 1o de janeiro; sem snap -> igual", () => {
  assertEquals(snapStart("2026-05-17", "month"), "2026-05-01");
  assertEquals(snapStart("2026-05-17", "year"), "2026-01-01");
  assertEquals(snapStart("2026-05-17", null), "2026-05-17");
});

Deno.test("presets: so citam datasets que existem; structure + stats + static cobrem todos sem repetir", () => {
  const names = ALL_DATASETS.map((d) => d.name);
  for (const list of Object.values(PRESETS)) for (const n of list) assert(names.includes(n), `dataset inexistente: ${n}`);
  assertEquals([...PRESETS.structure, ...PRESETS.stats, ...PRESETS.static].sort(), [...names].sort());
});

Deno.test("defaultWindow: termina hoje e volta N dias", () => {
  assertEquals(defaultWindow(new Date("2026-11-09T12:00:00Z"), 10), { start: "2026-10-30", end: "2026-11-09" });
});

Deno.test("mergeRows: soma metricas de linhas na mesma chave", () => {
  const out = mergeRows([{ k: "a", v: 1 }, { k: "a", v: 2 }, { k: "b", v: 5 }], ["k"], ["v"]);
  assertEquals(out, [{ k: "a", v: 3 }, { k: "b", v: 5 }]);
});

Deno.test("keywords: junta nota de qualidade com metricas pela chave grupo+criterio", async () => {
  await withGoogle((q) => {
    if (q.includes("FROM keyword_view")) {
      return [{ adGroup: { id: "10" }, adGroupCriterion: { criterionId: "99" }, metrics: { impressions: "500", clicks: "40", costMicros: "9000000", conversions: 2, conversionsValue: 300 } }];
    }
    return [{
      campaign: { id: "1" }, adGroup: { id: "10" },
      adGroupCriterion: {
        criterionId: "99", status: "ENABLED", negative: false, keyword: { text: "camiseta chronic", matchType: "PHRASE" },
        qualityInfo: { qualityScore: 7, creativeQualityScore: "AVERAGE", postClickQualityScore: "ABOVE_AVERAGE", searchPredictedCtr: "AVERAGE" },
        effectiveCpcBidMicros: "1500000",
      },
    }];
  }, async () => {
    const [k] = await ds("keywords").fetch(ctx);
    assertEquals([k.text, k.match_type, k.quality_score, k.landing_page_quality, k.cost_micros, k.conversions_value, k.campaign_id],
      ["camiseta chronic", "PHRASE", 7, "ABOVE_AVERAGE", 9000000, 300, 1]);
  });
});

Deno.test("search_terms: usa o ano do segmento e ignora linha sem termo", async () => {
  await withGoogle((q) => {
    assert(q.includes("BETWEEN '2025-01-01' AND '2025-12-31'"));
    return [
      { campaign: { id: "1" }, adGroup: { id: "10" }, searchTermView: { searchTerm: "use chronic", status: "ADDED" }, segments: { year: 2025 }, metrics: { impressions: "9", clicks: "3", costMicros: "2000000", conversions: 1, conversionsValue: 120 } },
      { campaign: { id: "1" }, adGroup: { id: "10" }, searchTermView: {}, segments: { year: 2025 }, metrics: {} },
    ];
  }, async () => {
    const rows = await ds("search_terms").fetch(ctx);
    assertEquals(rows.length, 1);
    assertEquals([rows[0].search_term, rows[0].year, rows[0].cost_micros], ["use chronic", 2025, 2000000]);
  });
});

Deno.test("geo: resolve o nome da regiao e usa o pais quando nao ha regiao", async () => {
  await withGoogle((q) => {
    if (q.includes("FROM geo_target_constant")) return [{ geoTargetConstant: { id: "20106", canonicalName: "State of Sao Paulo,Brazil" } }];
    return [
      { campaign: { id: "1" }, geographicView: { locationType: "LOCATION_OF_PRESENCE", countryCriterionId: "2076" }, segments: { geoTargetRegion: "geoTargetConstants/20106" }, metrics: { impressions: "5" } },
      { campaign: { id: "1" }, geographicView: { locationType: "LOCATION_OF_PRESENCE", countryCriterionId: "2076" }, segments: {}, metrics: { impressions: "2" } },
    ];
  }, async () => {
    const rows = await ds("geo").fetch(ctx);
    assertEquals(rows.map((r) => [r.region_key, r.region_name]), [["20106", "State of Sao Paulo,Brazil"], ["country:2076", null]]);
  });
});

Deno.test("products ignora produto sem id; changes converte data e hora do evento", async () => {
  await withGoogle(() => [
    { segments: { productItemId: "sku1", productTitle: "Camiseta" }, metrics: { clicks: "2", costMicros: "1000000" } },
    { segments: {}, metrics: { clicks: "9" } },
  ], async () => {
    assertEquals((await ds("products").fetch(ctx)).length, 1);
  });
  await withGoogle(() => [{
    changeEvent: { resourceName: "customers/1/changeEvents/123~0~0", changeDateTime: "2026-11-09 20:47:22.006835", changeResourceType: "CAMPAIGN_BUDGET", resourceChangeOperation: "UPDATE", changedFields: "amount_micros", userEmail: "a@b.c" },
  }], async () => {
    const [c] = await ds("changes").fetch({ ...ctx, end: "2026-11-09" });
    assertEquals([c.event_key, c.changed_at, c.operation], ["123~0~0", "2026-11-09T20:47:22.006835Z", "UPDATE"]);
  });
});

Deno.test("runDeep: mescla duplicatas antes de gravar, respeita o tempo e registra auditoria", async () => {
  const writes: Record<string, unknown[]> = {};
  const rec = (k: string, v: unknown) => (writes[k] ??= []).push(v);
  const sb = {
    from: (t: string) => ({
      upsert: (rows: unknown) => { rec(`${t}:upsert`, rows); return Promise.resolve({ error: null }); },
      insert: (row: unknown) => { rec(`${t}:insert`, row); return Promise.resolve({ error: null }); },
      update: (row: unknown) => { rec(`${t}:update`, row); return { eq: () => Promise.resolve({ error: null }) }; },
    }),
  };
  const account = { id: "a1", tenant_id: "t1", customer_id: "5220063897", login_customer_id: null };
  await withGoogle(() => [
    { campaign: { id: "1" }, segments: { device: "MOBILE", month: "2025-05-01" }, metrics: { impressions: "5", clicks: "1", costMicros: "100", conversions: 0, conversionsValue: 0 } },
    { campaign: { id: "1" }, segments: { device: "MOBILE", month: "2025-05-01" }, metrics: { impressions: "5", clicks: "2", costMicros: "200", conversions: 1, conversionsValue: 50 } },
  ], async () => {
    // deno-lint-ignore no-explicit-any
    const r = await runDeep(sb as any, account, CREDS, ["device_monthly"], { start: "2025-05-17", end: "2025-06-30", budgetMs: 60_000, actor: "system" });
    assertEquals(r.done[0], { dataset: "device_monthly", rows: 1 });
    const row = (writes["google_ads_device_monthly:upsert"][0] as Record<string, unknown>[])[0];
    assertEquals([row.impressions, row.clicks, row.cost_micros, row.conversions_value], [10, 3, 300, 50]);
    // deno-lint-ignore no-explicit-any
    const late = await runDeep(sb as any, account, CREDS, ["products"], { start: "2025-05-17", end: "2025-06-30", budgetMs: -1, actor: "system" });
    assertEquals(late.skipped, ["products"]);
    assertEquals((writes["google_ads_audit_log:insert"] ?? []).length, 2);
  });
});
