import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearTokenCache, type GoogleAdsCredentials } from "../_shared/google-ads-api.ts";
import { applyNegatives, applyRebuild, revertBuild } from "../_shared/google-ads-build-apply.ts";
import { parseQuickAction, sanitizeDraftPatch } from "../_shared/google-ads-build-draft.ts";

const CREDS: GoogleAdsCredentials = { developerToken: "d", clientId: "c", clientSecret: "s", refreshToken: "r", loginCustomerId: "9667440809" };
const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const base = { accountId: "a1", tenantId: "t1", actor: "user:u" };

/** Banco falso: cadeia generica; so a conta e as palavras de outras campanhas devolvem dados. */
function fakeDb(account: Record<string, unknown>, othersKeywords: Array<{ text: string; campaign_id: number }> = [], auditRow: Record<string, unknown> | null = null) {
  const writes: Record<string, unknown[]> = {};
  const chain = (table: string): unknown => new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => res({ data: table === "google_ads_keywords" ? othersKeywords : table === "google_ads_ads" ? [{ final_url: "https://loja.example/home" }] : [], error: null });
      if (prop === "maybeSingle") return () => Promise.resolve({ data: table === "google_ads_accounts" ? account : table === "google_ads_audit_log" ? auditRow : null, error: null });
      if (prop === "insert") return (row: unknown) => { (writes[`${table}:insert`] ??= []).push(row); return Promise.resolve({ error: null }); };
      return () => chain(table);
    },
  });
  // deno-lint-ignore no-explicit-any
  return { client: { from: (t: string) => chain(t) } as any, writes };
}
const ACC = { customer_id: "5220063897", login_customer_id: "9667440809", mode: "approval", descriptive_name: "Chronic", guardrails: { brand_terms: ["chronic", "cronic"] } };

interface GState { pages?: Record<string, number>; negatives: string[]; keywords: Array<{ rn: string; text: string; status: string }>; ads: Array<{ id: string; status: string; approval: string }>; mutations: Array<{ path: string; ops: Record<string, any>[] }>; failAdMutate?: boolean }

async function withGoogle(st: GState, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2")) return Promise.resolve(jsonRes({ access_token: "at", expires_in: 3600 }));
    if (url.startsWith("https://loja.example")) return Promise.resolve(new Response(null, { status: (st.pages ?? {})[url] ?? 200 }));
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("googleAds:search")) {
      const q: string = body.query;
      if (q.includes("FROM campaign_criterion")) return Promise.resolve(jsonRes({ results: st.negatives.map((t) => ({ campaignCriterion: { keyword: { text: t } } })) }));
      if (q.includes("FROM campaign WHERE")) return Promise.resolve(jsonRes({ results: [{ campaign: { status: "ENABLED" } }] }));
      if (q.includes("FROM ad_group WHERE")) return Promise.resolve(jsonRes({ results: [{ campaign: { id: "1", advertisingChannelType: "SEARCH", status: "ENABLED" }, adGroup: { status: "ENABLED" } }] }));
      if (q.includes("FROM ad_group_criterion")) {
        const on = q.includes("status = 'ENABLED'");
        return Promise.resolve(jsonRes({ results: st.keywords.filter((k) => !on || k.status === "ENABLED").map((k) => ({ adGroupCriterion: { keyword: { text: k.text, matchType: "PHRASE" } } })) }));
      }
      if (q.includes("FROM ad_group_ad")) {
        const on = q.includes("ad_group_ad.status = 'ENABLED'");
        return Promise.resolve(jsonRes({ results: st.ads.filter((a) => !on || a.status === "ENABLED").map((a) => ({ adGroupAd: { ad: { id: a.id, finalUrls: ["https://loja.example/anuncio"] }, status: a.status, policySummary: { approvalStatus: a.approval } } })) }));
      }
      return Promise.resolve(jsonRes({ results: [] }));
    }
    const path = url.split("/").pop()!.replace(":mutate", "");
    st.mutations.push({ path, ops: body.operations });
    if (path === "adGroupAds" && st.failAdMutate) return Promise.resolve(jsonRes({ error: { message: "politica: texto nao permitido", status: "INVALID_ARGUMENT" } }, 400));
    const results = body.operations.map((op: Record<string, any>, i: number) => {
      if (path === "campaignCriteria") { if (op.create) st.negatives.push(op.create.keyword.text); return { resourceName: op.remove ?? `customers/1/campaignCriteria/9~${i}` }; }
      if (path === "adGroupCriteria") {
        if (op.create) { const rn = `customers/1/adGroupCriteria/5~${st.keywords.length + 100}`; st.keywords.push({ rn, text: op.create.keyword.text, status: "ENABLED" }); return { resourceName: rn }; }
        st.keywords = st.keywords.filter((k) => k.rn !== op.remove); return { resourceName: op.remove };
      }
      if (op.update) { const id = op.update.resourceName.split("~")[1]; const ad = st.ads.find((a) => a.id === id); if (ad) ad.status = op.update.status; return { resourceName: op.update.resourceName }; }
      if (op.create) { st.ads.push({ id: "777", status: "ENABLED", approval: "UNDER_REVIEW" }); return { resourceName: "customers/1/adGroupAds/5~777" }; }
      st.ads = st.ads.filter((a) => `customers/1/adGroupAds/5~${a.id}` !== op.remove); return { resourceName: op.remove };
    });
    return Promise.resolve(jsonRes({ results }));
  }) as typeof fetch;
  clearTokenCache();
  try { await fn(); } finally { globalThis.fetch = original; clearTokenCache(); }
}
const fresh = (over: Partial<GState> = {}): GState => ({ negatives: [], keywords: [], ads: [], mutations: [], ...over });

Deno.test("negativas: cria EXATA, confere depois, grava auditoria; ignora as que ja existem", async () => {
  const { client, writes } = fakeDb(ACC);
  const st = fresh({ negatives: ["ja negativada"] });
  await withGoogle(st, async () => {
    const r = await applyNegatives(client, CREDS, { ...base, campaignId: 1, terms: ["roupas masculinas", "Ja Negativada", "site aprovando na hora"] });
    assertEquals(r.ok, true);
    assertEquals((r.detail as { terms: string[] }).terms, ["roupas masculinas", "site aprovando na hora"]);
  });
  const ops = st.mutations[0].ops;
  assertEquals(st.mutations[0].path, "campaignCriteria");
  assertEquals(ops.map((o) => [o.create.negative, o.create.keyword.matchType, o.create.keyword.text]), [[true, "EXACT", "roupas masculinas"], [true, "EXACT", "site aprovando na hora"]]);
  const a = writes["google_ads_audit_log:insert"][0] as Record<string, unknown>;
  assertEquals([a.action, a.entity], ["apply", "negatives:1"]);
});

Deno.test("negativas: termo com a marca, read_only e lista vazia sao recusados sem tocar no Google", async () => {
  const st = fresh();
  await withGoogle(st, async () => {
    const db = fakeDb(ACC).client;
    const brand = await applyNegatives(db, CREDS, { ...base, campaignId: 1, terms: ["roupa chronic"] });
    assert(!brand.ok && brand.error!.includes("marca"));
    const ro = await applyNegatives(fakeDb({ ...ACC, mode: "read_only" }).client, CREDS, { ...base, campaignId: 1, terms: ["x1"] });
    assert(!ro.ok && ro.error!.includes("somente leitura"));
    assert(!(await applyNegatives(db, CREDS, { ...base, campaignId: 1, terms: [] })).ok);
  });
  assertEquals(st.mutations.length, 0);
});

const kw = (text: string, match_type: "PHRASE" | "EXACT" = "PHRASE") => ({ text, match_type });
const goodAd = { headlines: ["Camiseta Chronic", "Chronic Oficial", "Moda Streetwear"], descriptions: ["Camisetas e bones da marca.", "Veja a linha completa."], final_url: "https://loja.example/c" };
const rebuild = { ...base, campaignId: 1, adGroupId: 5 };

Deno.test("reconstrucao: cria palavras, religa anuncio pausado aprovado, cria anuncio novo, confere e audita os recursos", async () => {
  const { client, writes } = fakeDb(ACC, [{ text: "so na outra", campaign_id: 2 }]);
  const st = fresh({ ads: [{ id: "10", status: "PAUSED", approval: "APPROVED" }] });
  await withGoogle(st, async () => {
    const r = await applyRebuild(client, CREDS, { ...rebuild, keywords: [kw("chronic camiseta"), kw("So Na Outra"), kw("loja chronic", "EXACT")], enableAdIds: [10], newAd: goodAd });
    assertEquals(r.ok, true);
    assertEquals(r.detail, { keywords: 2, enabled_ads: 1, new_ad: true });
  });
  assertEquals(st.mutations.map((m) => m.path), ["adGroupCriteria", "adGroupAds"]);
  assertEquals(st.keywords.map((k) => k.text), ["chronic camiseta", "loja chronic"]); // a que roda em outra campanha ficou de fora
  assertEquals(st.ads.find((a) => a.id === "10")!.status, "ENABLED");
  const audit = (writes["google_ads_audit_log:insert"][0] as { entity: string; after_state: { keywords: string[]; new_ad: string; confirmed: boolean } });
  assertEquals(audit.entity, "rebuild:1");
  assertEquals([audit.after_state.keywords.length, audit.after_state.new_ad, audit.after_state.confirmed], [2, "customers/1/adGroupAds/5~777", true]);
});

Deno.test("reconstrucao: recusa anuncio reprovado, anuncio novo invalido e resultado sem anuncio", async () => {
  const st = fresh({ ads: [{ id: "10", status: "PAUSED", approval: "DISAPPROVED" }] });
  await withGoogle(st, async () => {
    const db = fakeDb(ACC).client;
    const bad = await applyRebuild(db, CREDS, { ...rebuild, keywords: [kw("a1")], enableAdIds: [10], newAd: null });
    assert(!bad.ok && bad.error!.includes("reprovado"));
    const inv = await applyRebuild(db, CREDS, { ...rebuild, keywords: [kw("a1")], enableAdIds: [], newAd: { ...goodAd, headlines: ["so um"] } });
    assert(!inv.ok && inv.error!.includes("invalido"));
    const none = await applyRebuild(db, CREDS, { ...rebuild, keywords: [kw("a1")], enableAdIds: [], newAd: null });
    assert(!none.ok && none.error!.includes("Sem anuncio"));
  });
  assertEquals(st.mutations.length, 0);
});

Deno.test("reconstrucao: se o Google recusa o anuncio, as palavras recem-criadas sao removidas (nada pela metade)", async () => {
  const st = fresh({ failAdMutate: true });
  await withGoogle(st, async () => {
    const r = await applyRebuild(fakeDb(ACC).client, CREDS, { ...rebuild, keywords: [kw("chronic camiseta")], enableAdIds: [], newAd: goodAd });
    assert(!r.ok && r.error!.includes("recusou"));
  });
  assertEquals(st.mutations.map((m) => m.path), ["adGroupCriteria", "adGroupAds", "adGroupCriteria"]);
  assertEquals(st.keywords.length, 0);
});

Deno.test("desfazer reconstrucao: remove palavras e anuncio novo e volta os anuncios religados para pausado", async () => {
  const audit = { id: "x", entity: "rebuild:1", action: "apply", before_state: { ad_group: "customers/5220063897/adGroups/5" }, after_state: { keywords: ["customers/1/adGroupCriteria/5~100"], new_ad: "customers/1/adGroupAds/5~777", enabled_ads: [10] } };
  const st = fresh({ keywords: [{ rn: "customers/1/adGroupCriteria/5~100", text: "x", status: "ENABLED" }], ads: [{ id: "10", status: "ENABLED", approval: "APPROVED" }, { id: "777", status: "ENABLED", approval: "UNDER_REVIEW" }] });
  await withGoogle(st, async () => {
    const r = await revertBuild(fakeDb(ACC, [], audit).client, CREDS, { accountId: "a1", tenantId: "t1", actor: "user:u", auditId: "x" });
    assertEquals(r.ok, true);
  });
  assertEquals(st.ads.map((a) => [a.id, a.status]), [["10", "PAUSED"]]);
  assertEquals(st.keywords.length, 0);
});

Deno.test("rascunho: so permite manter o que os dados propuseram; texto do anuncio novo e livre mas validado em formato", () => {
  const cur = { campaign_id: 1, terms: ["roupas masculinas", "moda atacado"] };
  assertEquals(sanitizeDraftPatch("add_negative_keywords", cur, { terms: ["Roupas Masculinas"] }), { ok: true, payload: { ...cur, terms: ["Roupas Masculinas"] } });
  assert(!sanitizeDraftPatch("add_negative_keywords", cur, { terms: ["termo inventado"] }).ok);
  const rb = { campaign_id: 1, ad_group_id: 5, keywords: [{ text: "chronic camiseta", match_type: "PHRASE", source: "historico", value: 10 }], enable_ad_ids: [10], new_ad: null, needs_copy: true };
  assert(!sanitizeDraftPatch("rebuild_search_structure", rb, { keywords: [{ text: "outra", match_type: "PHRASE" }] }).ok);
  assert(!sanitizeDraftPatch("rebuild_search_structure", rb, { enable_ad_ids: [99] }).ok);
  const ok = sanitizeDraftPatch("rebuild_search_structure", rb, { new_ad: goodAd });
  assert(ok.ok && (ok.payload.needs_copy === false) && (ok.payload.new_ad as { headlines: string[] }).headlines.length === 3);
  assert(!sanitizeDraftPatch("rebuild_search_structure", rb, { new_ad: { headlines: "x", descriptions: [], final_url: "https://a" } }).ok);
  assert(!sanitizeDraftPatch("adjust_budget", rb, {}).ok);
});

Deno.test("reconstrucao: pagina de destino que nao abre (404) ou fora dos dominios da conta e recusada sem tocar no Google", async () => {
  const st = fresh({ pages: { "https://loja.example/c": 404 } });
  await withGoogle(st, async () => {
    const db = fakeDb(ACC).client;
    const r404 = await applyRebuild(db, CREDS, { ...rebuild, keywords: [kw("chronic camiseta")], enableAdIds: [], newAd: goodAd });
    assert(!r404.ok && r404.error!.includes("nao esta funcionando") && r404.error!.includes("404"));
    const outro = await applyRebuild(db, CREDS, { ...rebuild, keywords: [kw("chronic camiseta")], enableAdIds: [], newAd: { ...goodAd, final_url: "https://outro-site.com/x" } });
    assert(!outro.ok && outro.error!.includes("dominio"));
  });
  assertEquals(st.mutations.length, 0);
});

Deno.test("acao rapida: pausar, ligar e ajustar viram a proposta certa; valores fora da faixa e operacao estranha sao recusados", () => {
  const p = parseQuickAction({ campaign_id: 7, op: "pause" }, "Marca");
  assert(p.ok && p.kind === "pause_campaign" && p.payload.daily_budget_micros === null);
  const e = parseQuickAction({ campaign_id: 7, op: "enable", daily_budget_brl: 17.5 }, "Camisetas");
  assert(e.ok && e.kind === "enable_campaign" && e.payload.daily_budget_micros === 17_500_000);
  const b = parseQuickAction({ campaign_id: 7, op: "set_budget", daily_budget_brl: "38" }, "Marca");
  assert(b.ok && b.kind === "adjust_budget" && b.payload.daily_budget_micros === 38_000_000);
  assert(!parseQuickAction({ campaign_id: 7, op: "enable" }, "x").ok);
  assert(!parseQuickAction({ campaign_id: 7, op: "set_budget", daily_budget_brl: 5000 }, "x").ok);
  assert(!parseQuickAction({ campaign_id: 7, op: "set_budget", daily_budget_brl: 0.5 }, "x").ok);
  assert(!parseQuickAction({ campaign_id: 7, op: "delete" }, "x").ok);
  assert(!parseQuickAction({ campaign_id: -1, op: "pause" }, "x").ok);
});
