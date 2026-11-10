/**
 * Runner do motor de descobertas: le os dados detalhados ja sincronizados, roda as regras e guarda o relatorio em
 * google_ads_recommendations (agent data_insights, uma linha por conta, atualizada a cada execucao).
 * Nada aqui escreve no Google Ads.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildInsights, INSIGHTS, type InsightsReport } from "./google-ads-insights-rules.ts";
import type { Structure } from "./google-ads-readiness.ts";
import { allowedHostsFrom, checkUrls } from "./google-ads-url-check.ts";

export const INSIGHTS_AGENT = "data_insights";
const KEY = "insights:report";

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
};

/** Termos da marca: os informados em guardrails.brand_terms; senao, a primeira palavra do nome da conta (ex.: "Chronic"). */
export function resolveBrandTerms(guardrails: unknown, accountName: string | null): string[] {
  const g = (guardrails && typeof guardrails === "object" ? guardrails : {}) as Record<string, unknown>;
  if (Array.isArray(g.brand_terms)) {
    return g.brand_terms.filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2 && t.length <= 40).slice(0, 10);
  }
  const first = (accountName ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).find((w) => w.length >= 4);
  return first ? [first] : [];
}

export interface InsightsRunResult { account_id: string; ok: boolean; report?: InsightsReport; error?: string }

export async function runInsights(supabase: SupabaseClient, accountId: string, actor: string, now = new Date()): Promise<InsightsRunResult> {
  try {
    const acc = must(await supabase.from("google_ads_accounts").select("id, tenant_id, descriptive_name, guardrails").eq("id", accountId).limit(1), "conta")[0] as
      { id: string; tenant_id: string; descriptive_name: string | null; guardrails: Record<string, unknown> | null } | undefined;
    if (!acc) throw new Error("conta nao encontrada");
    const g = acc.guardrails ?? {};
    const brandTerms = resolveBrandTerms(g, acc.descriptive_name);
    const minRoas = typeof g.min_roas === "number" && g.min_roas > 0 ? g.min_roas : 3;

    const [split, zero, impr, dev, hours, geo, prodValue, prodCost, kws, ads, camps, existing, adGroups, assetGroups] = await Promise.all([
      brandTerms.length ? supabase.rpc("google_ads_term_split", { p_account: accountId, p_brand_terms: brandTerms }) : supabase.rpc("google_ads_term_split", { p_account: accountId, p_brand_terms: [] }),
      supabase.rpc("google_ads_term_zero", { p_account: accountId, p_min_cost_micros: INSIGHTS.wasteMinCost * 1_000_000, p_limit: 30 }),
      supabase.from("google_ads_impression_share").select("campaign_id, month, impressions, search_impression_share, search_budget_lost_share, search_rank_lost_share").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_device_monthly").select("device, month, cost_micros, conversions_value").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_hour_stats").select("year, day_of_week, hour, cost_micros, conversions_value").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_geo_totals").select("region_key, region_name, cost_micros, conversions_value").eq("account_id", accountId).order("cost_micros", { ascending: false }).limit(60),
      supabase.from("google_ads_products").select("item_id, title, cost_micros, conversions_value, conversions").eq("account_id", accountId).order("conversions_value", { ascending: false }).limit(200),
      supabase.from("google_ads_products").select("item_id, title, cost_micros, conversions_value, conversions").eq("account_id", accountId).order("cost_micros", { ascending: false }).limit(200),
      supabase.from("google_ads_keywords").select("campaign_id, ad_group_id, text, match_type, status, negative, quality_score, cost_micros, conversions, conversions_value").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_ads").select("campaign_id, ad_group_id, status, ad_strength, approval_status, final_url").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_campaigns").select("campaign_id, name, status, channel_type").eq("account_id", accountId),
      supabase.from("google_ads_recommendations").select("id").eq("account_id", accountId).eq("agent", INSIGHTS_AGENT).eq("dedupe_key", KEY).maybeSingle(),
      supabase.from("google_ads_ad_groups").select("campaign_id, ad_group_id, status").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_asset_groups").select("campaign_id, status").eq("account_id", accountId).limit(1000),
    ]);

    const products = new Map<string, Record<string, unknown>>();
    for (const p of [...must(prodValue, "produtos"), ...must(prodCost, "produtos")] as Array<Record<string, unknown>>) products.set(String(p.item_id), p);
    const n = (v: unknown) => Number(v ?? 0);
    const report = buildInsights({
      now, minRoas, brandTerms,
      split: (must(split, "termos") as Array<Record<string, unknown>>).map((r) => ({
        total_cost: n(r.total_cost), total_value: n(r.total_value), total_conversions: n(r.total_conversions), brand_cost: n(r.brand_cost), brand_value: n(r.brand_value),
        brand_conversions: n(r.brand_conversions), zero_conv_cost: n(r.zero_conv_cost), zero_conv_terms: n(r.zero_conv_terms),
      }))[0] ?? null,
      zeroTerms: (must(zero, "negativaveis") as Array<Record<string, unknown>>).map((r) => ({ search_term: String(r.search_term), cost_micros: n(r.cost_micros), clicks: n(r.clicks), impressions: n(r.impressions) })),
      imprShare: (must(impr, "impressoes") as Array<Record<string, unknown>>).map((r) => ({
        campaign_id: n(r.campaign_id), month: String(r.month), impressions: n(r.impressions),
        search_impression_share: r.search_impression_share == null ? null : n(r.search_impression_share),
        search_budget_lost_share: r.search_budget_lost_share == null ? null : n(r.search_budget_lost_share),
        search_rank_lost_share: r.search_rank_lost_share == null ? null : n(r.search_rank_lost_share),
      })),
      devices: (must(dev, "dispositivos") as Array<Record<string, unknown>>).map((r) => ({ device: String(r.device), month: String(r.month), cost_micros: n(r.cost_micros), conversions_value: n(r.conversions_value) })),
      hours: (must(hours, "horas") as Array<Record<string, unknown>>).map((r) => ({ year: n(r.year), day_of_week: String(r.day_of_week), hour: n(r.hour), cost_micros: n(r.cost_micros), conversions_value: n(r.conversions_value) })),
      geo: (must(geo, "regioes") as Array<Record<string, unknown>>).map((r) => ({ region_key: String(r.region_key), region_name: (r.region_name as string) ?? null, cost_micros: n(r.cost_micros), conversions_value: n(r.conversions_value) })),
      products: [...products.values()].map((r) => ({ item_id: String(r.item_id), title: (r.title as string) ?? null, cost_micros: n(r.cost_micros), conversions_value: n(r.conversions_value), conversions: n(r.conversions) })),
      keywords: (must(kws, "palavras") as Array<Record<string, unknown>>).map((r) => ({
        text: String(r.text), match_type: (r.match_type as string) ?? null, status: String(r.status), negative: r.negative === true,
        quality_score: r.quality_score == null ? null : n(r.quality_score), cost_micros: n(r.cost_micros), conversions: n(r.conversions), conversions_value: n(r.conversions_value),
      })),
      ads: must(ads, "anuncios") as Array<{ campaign_id: number; status: string; ad_strength: string | null; approval_status: string | null }>,
      campaigns: must(camps, "campanhas") as Array<{ campaign_id: number; name: string; status: string; channel_type: string | null }>,
      structure: {
        adGroups: must(adGroups, "grupos"), ads: must(ads, "anuncios"), keywords: must(kws, "palavras"), assetGroups: must(assetGroups, "ativos"),
      } as unknown as Structure,
    });

    // Paginas de destino dos anuncios LIGADOS em campanhas ligadas (testadas com o robo do Google; so dominios da propria conta).
    const adRows = must(ads, "anuncios") as Array<{ campaign_id: number; status: string; final_url?: string | null }>;
    const enabledCamps = new Set((must(camps, "campanhas") as Array<{ campaign_id: number; status: string }>).filter((c) => c.status === "ENABLED").map((c) => Number(c.campaign_id)));
    const live = adRows.filter((a) => a.status === "ENABLED" && enabledCamps.has(Number(a.campaign_id)) && a.final_url);
    const urlCount = new Map<string, number>();
    for (const a of live) urlCount.set(String(a.final_url), (urlCount.get(String(a.final_url)) ?? 0) + 1);
    const checks = await checkUrls([...urlCount.keys()].slice(0, 15), allowedHostsFrom(adRows.map((a) => a.final_url ?? null)));
    report.broken_destinations = [...checks.values()].filter((c) => !c.ok).map((c) => ({ url: c.url, status: c.status, ads: urlCount.get(c.url) ?? 0 }));
    if (report.broken_destinations.length) {
      report.findings.unshift({
        id: "broken_destination", severity: "high",
        title: `${report.broken_destinations.length} pagina(s) de destino de anuncios ligados nao abrem para o Google`,
        detail: report.broken_destinations.slice(0, 4).map((b) => `${b.url.replace(/^https?:\/\/(www\.)?/, "")} (${b.status ?? "sem resposta"}, ${b.ads} anuncio(s))`).join("; ") + ". O Google reprova o anuncio (DESTINATION_NOT_WORKING) e o clique vai para uma pagina quebrada. Corrija a pagina ou troque a URL do anuncio.",
      });
    }

    const fields = {
      kind: "insights_report", severity: "low", risk: "low", title: "Descobertas dos dados do Google (historico completo)",
      rationale: report.findings.map((f) => `${f.title}. ${f.detail}`).join("\n").slice(0, 7900) || "Sem achados relevantes.",
      payload: { report },
    };
    const prev = (existing as { data: { id: string } | null }).data;
    if (prev) {
      const { error } = await supabase.from("google_ads_recommendations").update({ ...fields, status: "pending" }).eq("id", prev.id);
      if (error) throw new Error(`atualizar descobertas: ${error.message}`);
    } else {
      const { error } = await supabase.from("google_ads_recommendations").insert({ tenant_id: acc.tenant_id, account_id: accountId, agent: INSIGHTS_AGENT, dedupe_key: KEY, status: "pending", ...fields });
      if (error) throw new Error(`criar descobertas: ${error.message}`);
    }
    await supabase.from("google_ads_audit_log").insert({ tenant_id: acc.tenant_id, account_id: accountId, actor, action: "insights", after_state: { findings: report.findings.map((f) => f.id) } });
    return { account_id: accountId, ok: true, report };
  } catch (err) {
    return { account_id: accountId, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}
