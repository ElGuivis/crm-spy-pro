/**
 * Geradores de PROPOSTAS de construcao (sem IA, sem escrever no Google): negativas por campanha e reconstrucao de campanhas
 * de Pesquisa que sao boas no historico mas hoje nao veiculam. Gravam em google_ads_recommendations (agent build_agent)
 * sem duplicar e respeitando decisoes do usuario. Quem aplica no Google e o google-ads-apply.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BUILD, buildKeywordProposals, buildNegativeProposals, norm, type TermAgg } from "./google-ads-build-core.ts";
import { resolveBrandTerms } from "./google-ads-insights-runner.ts";
import { allowedHostsFrom, checkUrls } from "./google-ads-url-check.ts";
import { unreadyReasons, type Structure } from "./google-ads-readiness.ts";
import type { StrategyReport } from "./google-ads-strategy-rules.ts";

export const BUILD_AGENT = "build_agent";

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
};
type R = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface Proposal { key: string; fields: Record<string, unknown> }

/** Cria/atualiza/expira as propostas de uma familia (prefixo da chave) sem mexer no que o usuario ja decidiu. */
async function reconcile(supabase: SupabaseClient, accountId: string, tenantId: string, prefix: string, proposals: Proposal[]) {
  const existing = must(await supabase.from("google_ads_recommendations").select("id, dedupe_key, status")
    .eq("account_id", accountId).eq("agent", BUILD_AGENT).like("dedupe_key", `${prefix}%`), "propostas") as Array<{ id: string; dedupe_key: string; status: string }>;
  const prev = new Map(existing.map((e) => [e.dedupe_key, e]));
  for (const p of proposals) {
    const old = prev.get(p.key);
    if (!old) {
      const { error } = await supabase.from("google_ads_recommendations").insert({ tenant_id: tenantId, account_id: accountId, agent: BUILD_AGENT, dedupe_key: p.key, status: "pending", ...p.fields });
      if (error) throw new Error(`criar proposta: ${error.message}`);
    } else if (old.status !== "rejected") {
      // pending/expired/failed/applied: a situacao atual ainda pede a proposta -> atualiza e reabre.
      const { error } = await supabase.from("google_ads_recommendations").update({ ...p.fields, status: "pending", decided_at: null, decided_by: null, applied_at: null, error: null }).eq("id", old.id);
      if (error) throw new Error(`atualizar proposta: ${error.message}`);
    }
  }
  const live = new Set(proposals.map((p) => p.key));
  for (const old of existing) if (old.status === "pending" && !live.has(old.dedupe_key)) await supabase.from("google_ads_recommendations").update({ status: "expired" }).eq("id", old.id);
}

// ---------------------------------------------------------------------------
export async function proposeNegatives(supabase: SupabaseClient, accountId: string): Promise<{ ok: boolean; proposals?: number; error?: string }> {
  try {
    const acc = must(await supabase.from("google_ads_accounts").select("tenant_id, descriptive_name, guardrails").eq("id", accountId).limit(1), "conta")[0] as
      { tenant_id: string; descriptive_name: string | null; guardrails: unknown } | undefined;
    if (!acc) throw new Error("conta nao encontrada");
    const brand = resolveBrandTerms(acc.guardrails, acc.descriptive_name);

    const zero = must(await supabase.rpc("google_ads_term_zero", { p_account: accountId, p_min_cost_micros: BUILD.negativeMinCost * 1_000_000, p_limit: 80 }), "termos") as R[];
    const terms = zero.map((z) => String(z.search_term));
    let rows: R[] = [];
    if (terms.length) rows = must(await supabase.from("google_ads_search_terms").select("campaign_id, search_term, cost_micros, conversions, conversions_value").eq("account_id", accountId).in("search_term", terms).limit(1000), "linhas") as R[];

    const [camps, negs] = await Promise.all([
      supabase.from("google_ads_campaigns").select("campaign_id, status, name").eq("account_id", accountId),
      supabase.from("google_ads_negatives").select("campaign_id, text").eq("account_id", accountId).eq("source", "campaign"),
    ]);
    const campRows = must(camps, "campanhas") as R[];
    const enabled = new Set(campRows.filter((c) => c.status === "ENABLED").map((c) => n(c.campaign_id)));
    const nameOf = new Map(campRows.map((c) => [n(c.campaign_id), String(c.name)]));
    const existing = new Set((must(negs, "negativas") as R[]).map((x) => `${n(x.campaign_id)}|${norm(String(x.text ?? ""))}`));

    const agg: TermAgg[] = rows.map((r) => ({ campaign_id: n(r.campaign_id), term: String(r.search_term), cost: n(r.cost_micros) / 1e6, conversions: n(r.conversions), value: n(r.conversions_value) }));
    const props = buildNegativeProposals(agg, brand, existing, enabled);

    const byCamp = new Map<number, typeof props>();
    for (const p of props) (byCamp.get(p.campaign_id) ?? byCamp.set(p.campaign_id, []).get(p.campaign_id)!).push(p);
    const proposals: Proposal[] = [...byCamp.entries()].map(([cid, list]) => ({
      key: `neg:${cid}`,
      fields: {
        kind: "add_negative_keywords", severity: "low", risk: "low",
        title: `Negativar ${list.length} termo(s) em "${nameOf.get(cid) ?? cid}"`,
        rationale: `Termos que gastaram ${money(list.reduce((a, x) => a + x.cost, 0))} no total e nunca converteram (correspondencia exata, entao so bloqueia essa busca exata). Nenhum contem a marca. Revise a lista: tire o que voce quiser manter.`,
        payload: { campaign_id: cid, terms: list.map((x) => x.text), term_costs: list.map((x) => ({ text: x.text, cost: x.cost })) },
      },
    }));
    await reconcile(supabase, accountId, acc.tenant_id, "neg:", proposals);
    return { ok: true, proposals: proposals.length };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 400) };
  }
}

// ---------------------------------------------------------------------------
export async function proposeRebuilds(supabase: SupabaseClient, accountId: string, report: StrategyReport): Promise<{ ok: boolean; proposals?: number; error?: string }> {
  try {
    const acc = must(await supabase.from("google_ads_accounts").select("tenant_id").eq("id", accountId).limit(1), "conta")[0] as { tenant_id: string } | undefined;
    if (!acc) throw new Error("conta nao encontrada");
    const [campaigns, adGroups, ads, kws, assetGroups] = await Promise.all([
      supabase.from("google_ads_campaigns").select("campaign_id, name, status, channel_type").eq("account_id", accountId),
      supabase.from("google_ads_ad_groups").select("campaign_id, ad_group_id, status, cost_micros").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_ads").select("campaign_id, ad_group_id, ad_id, status, approval_status, final_url, conversions_value").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_keywords").select("campaign_id, ad_group_id, text, match_type, status, negative, cost_micros, conversions_value").eq("account_id", accountId).limit(1000),
      supabase.from("google_ads_asset_groups").select("campaign_id, status").eq("account_id", accountId).limit(1000),
    ]);
    const camps = must(campaigns, "campanhas") as R[];
    const A = must(adGroups, "grupos") as R[], D = must(ads, "anuncios") as R[], K = must(kws, "palavras") as R[];
    const structure = { adGroups: A, ads: D, keywords: K, assetGroups: must(assetGroups, "ativos") } as unknown as Structure;
    const unready = unreadyReasons(camps as unknown as Array<{ campaign_id: number; channel_type: string | null }>, structure);
    const enabledIds = new Set(camps.filter((c) => c.status === "ENABLED").map((c) => n(c.campaign_id)));
    const usedElsewhere = (cid: number) => new Set(K.filter((k) => k.status === "ENABLED" && !k.negative && n(k.campaign_id) !== cid && enabledIds.has(n(k.campaign_id))).map((k) => norm(String(k.text))));

    const allowedHosts = allowedHostsFrom(D.map((a) => a.final_url as string | null));
    const proposals: Proposal[] = [];
    for (const c of report.campaigns.filter((x) => (x.verdict === "running" || x.verdict === "reactivate") && unready.has(x.campaign_id))) {
      const camp = camps.find((x) => n(x.campaign_id) === c.campaign_id);
      if (!camp || camp.channel_type !== "SEARCH") continue;
      const groups = A.filter((g) => n(g.campaign_id) === c.campaign_id && g.status === "ENABLED").sort((a, b) => n(b.cost_micros) - n(a.cost_micros));
      if (!groups.length) continue;
      const ag = n(groups[0].ad_group_id);

      const hist = K.filter((k) => n(k.campaign_id) === c.campaign_id && !k.negative).map((k) => ({ text: String(k.text), match_type: (k.match_type as string) ?? null, cost: n(k.cost_micros) / 1e6, value: n(k.conversions_value) }));
      const termRows = must(await supabase.from("google_ads_search_terms").select("search_term, cost_micros, conversions_value").eq("account_id", accountId).eq("campaign_id", c.campaign_id).gt("conversions_value", 0).order("conversions_value", { ascending: false }).limit(300), "termos") as R[];
      const byTerm = new Map<string, { term: string; value: number; cost: number }>();
      for (const t of termRows) {
        const k = norm(String(t.search_term));
        const e = byTerm.get(k) ?? { term: String(t.search_term), value: 0, cost: 0 };
        e.value += n(t.conversions_value); e.cost += n(t.cost_micros) / 1e6; byTerm.set(k, e);
      }
      const keywords = buildKeywordProposals(hist, [...byTerm.values()], usedElsewhere(c.campaign_id));
      if (!keywords.length) continue;

      const campAds = D.filter((a) => n(a.campaign_id) === c.campaign_id);
      const enableCands = D.filter((a) => n(a.ad_group_id) === ag && a.status === "PAUSED" && a.approval_status === "APPROVED")
        .sort((a, b) => n(b.conversions_value) - n(a.conversions_value)).slice(0, 3);
      // Pagina de destino: testa com o robo do Google. Anuncios cuja pagina nao abre nao sao religados; a URL do anuncio novo
      // e a melhor entre as ja aprovadas na campanha (e a pagina inicial) que realmente responde 200.
      const urlCands = [...new Set([...campAds.filter((a) => a.approval_status === "APPROVED" && a.final_url).sort((a, b) => n(b.conversions_value) - n(a.conversions_value)).map((a) => String(a.final_url)),
        ...[...allowedHosts].slice(0, 1).map((h) => `https://www.${h}/`)])].slice(0, 6);
      const checks = await checkUrls([...urlCands, ...enableCands.map((a) => String(a.final_url ?? "")).filter(Boolean)], allowedHosts);
      const enable = enableCands.filter((a) => !a.final_url || checks.get(String(a.final_url))?.ok).map((a) => n(a.ad_id));
      const bestUrl = urlCands.find((u) => checks.get(u)?.ok);
      const brokenUrls = [...checks.values()].filter((x) => !x.ok).map((x) => `${x.url.replace(/^https?:\/\/(www\.)?/, "")} (${x.status ?? "sem resposta"})`);
      const reasons = unready.get(c.campaign_id)!.join("; ");
      proposals.push({
        key: `rebuild:${c.campaign_id}`,
        fields: {
          kind: "rebuild_search_structure", severity: "high", risk: "medium",
          title: `Reconstruir "${c.name}": ${keywords.length} palavras-chave${enable.length ? ` + religar ${enable.length} anuncio(s)` : " + anuncio novo"}`,
          rationale: `Na vida, esta campanha gastou ${money(c.lifetime.cost)} e trouxe ${money(c.lifetime.revenue)} (ROAS ${c.lifetime.roas ?? "n/d"}x), mas hoje nao veicula (${reasons}). Proposta: recriar as palavras-chave que mais venderam (as amplas viram frase, mais seguras)${enable.length ? ", religar anuncios pausados e aprovados" : ", e escrever um anuncio novo (o anterior foi removido ou reprovado)"}. Palavras que ja rodam em outra campanha ligada foram deixadas de fora para voce nao competir contra voce mesmo.${brokenUrls.length ? ` ATENCAO: estas paginas de destino NAO abrem para o robo do Google e foram evitadas: ${brokenUrls.slice(0, 4).join(", ")}.` : ""}${bestUrl ? "" : " Nenhuma pagina de destino conhecida respondeu: corrija o site antes de aplicar."}`,
          payload: {
            campaign_id: c.campaign_id, ad_group_id: ag, keywords: keywords.map((k) => ({ text: k.text, match_type: k.match_type, source: k.source, value: Math.round(k.value) })),
            enable_ad_ids: enable, new_ad: null, needs_copy: enable.length === 0, final_url: bestUrl ?? null,
            url_problems: brokenUrls,
          },
        },
      });
    }
    await reconcile(supabase, accountId, acc.tenant_id, "rebuild:", proposals);
    return { ok: true, proposals: proposals.length };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 400) };
  }
}
