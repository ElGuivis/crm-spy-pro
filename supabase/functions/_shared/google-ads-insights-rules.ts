import { unreadyReasons, type Structure } from "./google-ads-readiness.ts";

/**
 * Motor de descobertas (tipo A: regras em codigo, sem IA, sem tokens). Le os dados detalhados do Google ja sincronizados e
 * devolve fatos + achados em linguagem simples. Funcoes puras: nao falam com o banco nem com o Google.
 * Todo achado traz o numero que o sustenta; amostra pequena nao vira conclusao (limiares em INSIGHTS).
 */

export const INSIGHTS = {
  brandDependenceShare: 0.6,   // marca >= 60% da receita das buscas -> achado
  minNonBrandSpend: 1_000,     // R$: gasto minimo fora da marca para opinar sobre o ROAS dele
  wasteMinCost: 30,            // R$: termo sem conversao com gasto >= isto vira candidato a negativar
  rankLimitedShare: 0.4,       // perda de impressoes por ranking >= 40% (e maior que por orcamento)
  budgetLimitedShare: 0.2,     // perda por orcamento >= 20%
  skewRatio: 1.25,             // dispositivo/dia: melhor >= 1,25x o pior (com gasto minimo)
  minSegmentSpend: 1_000,      // R$ por segmento (dispositivo/dia) para comparar
  minHourSpend: 200,
  productWasteMinCost: 50,
  keywordWasteMinCost: 100,
  lowQualityScore: 4,
} as const;

export interface TermSplit {
  total_cost: number; total_value: number; total_conversions: number;
  brand_cost: number; brand_value: number; brand_conversions: number;
  zero_conv_cost: number; zero_conv_terms: number;
}
export interface ZeroTerm { search_term: string; cost_micros: number; clicks: number; impressions: number }
export interface ImprShareRow { campaign_id: number; month: string; impressions: number; search_impression_share: number | null; search_budget_lost_share: number | null; search_rank_lost_share: number | null }
export interface DeviceRow { device: string; month: string; cost_micros: number; conversions_value: number }
export interface HourRow { year: number; day_of_week: string; hour: number; cost_micros: number; conversions_value: number }
export interface GeoRow { region_key: string; region_name: string | null; cost_micros: number; conversions_value: number }
export interface ProductRow { item_id: string; title: string | null; cost_micros: number; conversions_value: number; conversions: number }
export interface KeywordRow { text: string; match_type: string | null; status: string; negative: boolean; quality_score: number | null; cost_micros: number; conversions: number; conversions_value: number }
export interface AdRow { campaign_id?: number; status: string; ad_strength: string | null; approval_status: string | null }
export interface CampaignRef { campaign_id: number; name: string; status: string; channel_type?: string | null }

export interface InsightsInput {
  now: Date;
  minRoas: number;
  brandTerms: string[];
  split: TermSplit | null;
  zeroTerms: ZeroTerm[];
  imprShare: ImprShareRow[];
  devices: DeviceRow[];
  hours: HourRow[];
  geo: GeoRow[];
  products: ProductRow[];
  keywords: KeywordRow[];
  ads: AdRow[];
  campaigns: CampaignRef[];
  /** Estrutura sincronizada para checar se as campanhas ligadas conseguem veicular. */
  structure?: Structure;
  /** Paginas de destino dos anuncios ligados, ja testadas com o robo do Google. */
  destinations?: Array<{ url: string; ok: boolean; status: number | null; reason?: string; ads: number }>;
}

export interface Finding { id: string; severity: "high" | "medium" | "low" | "info"; title: string; detail: string }

export interface InsightsReport {
  generated_at: string;
  brand_terms: string[];
  brand: { cost: number; revenue: number; roas: number | null; share_of_revenue: number | null; share_of_cost: number | null; non_brand_cost: number; non_brand_revenue: number; non_brand_roas: number | null } | null;
  waste: { terms: number; cost: number; top: Array<{ term: string; cost: number; clicks: number }> };
  impression_share: Array<{ campaign: string; share: number | null; lost_budget: number | null; lost_rank: number | null; limit: "budget" | "rank" | "both" | "none" }>;
  devices: Array<{ device: string; cost: number; roas: number | null }>;
  weekdays: Array<{ day: string; cost: number; roas: number | null }>;
  hours: { best: Array<{ hour: number; cost: number; roas: number | null }>; worst: Array<{ hour: number; cost: number; roas: number | null }> };
  regions: Array<{ region: string; cost: number; roas: number | null }>;
  products: { top: Array<{ title: string; revenue: number; cost: number }>; waste: Array<{ title: string; cost: number }> };
  keywords: { waste: Array<{ text: string; cost: number }>; low_quality: Array<{ text: string; score: number; cost: number }> };
  ads: { total: number; weak: number; not_approved: number };
  not_serving: Array<{ campaign: string; reasons: string[] }>;
  broken_destinations: Array<{ url: string; status: number | null; ads: number }>;
  findings: Finding[];
}

const R = (micros: number) => Math.round(micros / 10_000) / 100;
const roas = (value: number, costMicros: number): number | null => (costMicros > 0 ? Math.round((value / (costMicros / 1e6)) * 100) / 100 : null);
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const x = (v: number | null) => (v == null ? "n/d" : `${v.toFixed(1).replace(".", ",")}x`);
const DAY_PT: Record<string, string> = { MONDAY: "segunda", TUESDAY: "terca", WEDNESDAY: "quarta", THURSDAY: "quinta", FRIDAY: "sexta", SATURDAY: "sabado", SUNDAY: "domingo" };
const DEVICE_PT: Record<string, string> = { MOBILE: "celular", DESKTOP: "computador", TABLET: "tablet", CONNECTED_TV: "TV" };

function groupSum<T>(rows: T[], key: (r: T) => string, cost: (r: T) => number, value: (r: T) => number) {
  const m = new Map<string, { cost: number; value: number }>();
  for (const r of rows) {
    const k = key(r); const e = m.get(k) ?? { cost: 0, value: 0 };
    e.cost += cost(r); e.value += value(r); m.set(k, e);
  }
  return [...m.entries()].map(([k, e]) => ({ key: k, cost: e.cost, value: e.value, roas: roas(e.value, e.cost) }));
}

export function buildInsights(input: InsightsInput): InsightsReport {
  const T = INSIGHTS;
  const findings: Finding[] = [];
  const nameOf = new Map(input.campaigns.map((c) => [c.campaign_id, c.name]));

  // --- Marca x demais buscas
  let brand: InsightsReport["brand"] = null;
  const s = input.split;
  if (s && s.total_cost > 0 && input.brandTerms.length) {
    const nbCost = s.total_cost - s.brand_cost;
    const nbRev = s.total_value - s.brand_value;
    brand = {
      cost: R(s.brand_cost), revenue: Math.round(s.brand_value), roas: roas(s.brand_value, s.brand_cost),
      share_of_revenue: s.total_value > 0 ? Math.round((s.brand_value / s.total_value) * 1000) / 1000 : null,
      share_of_cost: Math.round((s.brand_cost / s.total_cost) * 1000) / 1000,
      non_brand_cost: R(nbCost), non_brand_revenue: Math.round(nbRev), non_brand_roas: roas(nbRev, nbCost),
    };
    if (brand.share_of_revenue !== null && brand.share_of_revenue >= T.brandDependenceShare) {
      findings.push({
        id: "brand_dependence", severity: "high",
        title: `${pct(brand.share_of_revenue)} da receita das buscas vem de termos com o nome da marca`,
        detail: `Termos com ${input.brandTerms.map((t) => `"${t}"`).join(" ou ")} geraram ${money(brand.revenue)} (ROAS ${x(brand.roas)}). Quem pesquisa o nome da marca ja conhece a loja: parte dessas vendas aconteceria sem anuncio, entao o ROAS real dos anuncios tende a ser menor que o mostrado. As buscas SEM a marca gastaram ${money(brand.non_brand_cost)} com ROAS ${x(brand.non_brand_roas)}.`,
      });
    }
    if (nbCost / 1e6 >= T.minNonBrandSpend && brand.non_brand_roas !== null && brand.non_brand_roas < input.minRoas) {
      findings.push({
        id: "non_brand_weak", severity: "medium",
        title: "Buscas sem o nome da marca nao se pagam",
        detail: `Gastaram ${money(brand.non_brand_cost)} com ROAS ${x(brand.non_brand_roas)}, abaixo do minimo de ${x(input.minRoas)}. Para atrair clientes novos sera preciso outro formato (ex.: Shopping, remarketing) em vez de palavras genericas.`,
      });
    }
  }

  // --- Desperdicio em termos
  const wasteTop = input.zeroTerms.filter((t) => t.cost_micros / 1e6 >= T.wasteMinCost).slice(0, 15);
  const waste = {
    terms: s?.zero_conv_terms ?? wasteTop.length, cost: s ? R(s.zero_conv_cost) : R(wasteTop.reduce((a, t) => a + t.cost_micros, 0)),
    top: wasteTop.map((t) => ({ term: t.search_term, cost: R(t.cost_micros), clicks: t.clicks })),
  };
  if (wasteTop.length) {
    const sum = wasteTop.reduce((a, t) => a + t.cost_micros, 0);
    findings.push({
      id: "negative_candidates", severity: "low",
      title: `${wasteTop.length} termos gastaram ${money(R(sum))} sem nenhuma conversao`,
      detail: `Sao candidatos a palavra-chave negativa (revise antes: um termo da marca sem venda pode so precisar de pagina melhor). Maiores: ${wasteTop.slice(0, 5).map((t) => `"${t.search_term}" (${money(R(t.cost_micros))})`).join(", ")}.`,
    });
  }

  // --- Participacao de impressoes: onde esta o gargalo (so meses com impressoes relevantes)
  const byCamp = new Map<number, ImprShareRow[]>();
  for (const r of input.imprShare.filter((r) => r.impressions > 0)) (byCamp.get(r.campaign_id) ?? byCamp.set(r.campaign_id, []).get(r.campaign_id)!).push(r);
  const impressionShare: InsightsReport["impression_share"] = [];
  for (const [cid, rows] of byCamp) {
    const recent = rows.sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
    const avg = (f: (r: ImprShareRow) => number | null) => {
      const have = recent.filter((r) => f(r) !== null);
      const ws = have.reduce((a, r) => a + r.impressions, 0);
      return ws > 0 ? Math.round((have.reduce((a, r) => a + (f(r) as number) * r.impressions, 0) / ws) * 1000) / 1000 : null;
    };
    const lb = avg((r) => r.search_budget_lost_share); const lr = avg((r) => r.search_rank_lost_share);
    const rank = (lr ?? 0) >= T.rankLimitedShare && (lr ?? 0) > (lb ?? 0);
    const budget = (lb ?? 0) >= T.budgetLimitedShare;
    impressionShare.push({
      campaign: nameOf.get(cid) ?? String(cid), share: avg((r) => r.search_impression_share), lost_budget: lb, lost_rank: lr,
      limit: rank && budget ? "both" : rank ? "rank" : budget ? "budget" : "none",
    });
  }
  const rankLimited = impressionShare.filter((r) => r.limit === "rank" || r.limit === "both");
  if (rankLimited.length) {
    findings.push({
      id: "rank_limited", severity: "medium",
      title: "O limite de alcance e a posicao no leilao, nao a verba",
      detail: `${rankLimited.length} campanha(s) de Pesquisa perdem a maior parte das impressoes por ranking (ex.: ${rankLimited.slice(0, 3).map((r) => `${r.campaign}: ${pct(r.lost_rank ?? 0)}`).join("; ")}) e quase nada por orcamento. Aumentar a verba nao traz mais gente: o que ajuda e lance, qualidade do anuncio e da pagina.`,
    });
  }

  // --- Dispositivo, dia da semana, hora
  const dev = groupSum(input.devices, (d) => d.device, (d) => d.cost_micros, (d) => d.conversions_value).filter((d) => d.cost / 1e6 >= T.minSegmentSpend && d.roas !== null);
  if (dev.length >= 2) {
    const sorted = [...dev].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if ((best.roas ?? 0) / Math.max(worst.roas ?? 0.01, 0.01) >= T.skewRatio) {
      findings.push({
        id: "device_skew", severity: "low",
        title: `${DEVICE_PT[best.key] ?? best.key} rende mais que ${DEVICE_PT[worst.key] ?? worst.key}`,
        detail: `ROAS ${x(best.roas)} (${money(R(best.cost))} gastos) contra ${x(worst.roas)} (${money(R(worst.cost))}). Considere ajuste de lance por dispositivo.`,
      });
    }
  }
  const latest = input.hours.reduce((m, h) => Math.max(m, h.year), 0);
  const recentHours = input.hours.filter((h) => h.year >= latest - 1);
  const days = groupSum(recentHours, (h) => h.day_of_week, (h) => h.cost_micros, (h) => h.conversions_value).filter((d) => d.cost / 1e6 >= T.minSegmentSpend);
  const dayList = days.sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  if (dayList.length >= 3) {
    const best = dayList[0], worst = dayList[dayList.length - 1];
    if ((best.roas ?? 0) / Math.max(worst.roas ?? 0.01, 0.01) >= T.skewRatio) {
      findings.push({
        id: "weekday_skew", severity: "low",
        title: `${DAY_PT[worst.key] ?? worst.key} e o pior dia; ${DAY_PT[best.key] ?? best.key}, o melhor`,
        detail: `ROAS ${x(worst.roas)} contra ${x(best.roas)} (anos ${latest - 1} e ${latest}). Vale testar programacao de anuncios com menos verba no dia fraco.`,
      });
    }
  }
  const hrs = groupSum(recentHours, (h) => String(h.hour), (h) => h.cost_micros, (h) => h.conversions_value)
    .filter((h) => h.cost / 1e6 >= T.minHourSpend && h.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));

  // --- Regioes
  const regions = groupSum(input.geo, (g) => g.region_name ?? g.region_key, (g) => g.cost_micros, (g) => g.conversions_value)
    .sort((a, b) => b.cost - a.cost).slice(0, 8).map((g) => ({ region: g.key.replace(/,Brazil$/, ""), cost: R(g.cost), roas: g.roas }));

  // --- Produtos
  const topProducts = [...input.products].sort((a, b) => b.conversions_value - a.conversions_value).slice(0, 8)
    .filter((p) => p.conversions_value > 0).map((p) => ({ title: p.title ?? p.item_id, revenue: Math.round(p.conversions_value), cost: R(p.cost_micros) }));
  const wasteProducts = input.products.filter((p) => p.conversions === 0 && p.cost_micros / 1e6 >= T.productWasteMinCost)
    .sort((a, b) => b.cost_micros - a.cost_micros).slice(0, 8).map((p) => ({ title: p.title ?? p.item_id, cost: R(p.cost_micros) }));
  if (wasteProducts.length) {
    findings.push({
      id: "product_waste", severity: "low", title: `${wasteProducts.length} produtos com gasto e nenhuma venda no Shopping`,
      detail: `Maiores: ${wasteProducts.slice(0, 4).map((p) => `${p.title} (${money(p.cost)})`).join("; ")}. Considere tirar do grupo de produtos anunciados ou revisar preco e foto.`,
    });
  }

  // --- Palavras-chave e anuncios
  const kws = input.keywords.filter((k) => !k.negative && k.status === "ENABLED");
  const kwWaste = input.keywords.filter((k) => !k.negative && k.conversions === 0 && k.cost_micros / 1e6 >= T.keywordWasteMinCost)
    .sort((a, b) => b.cost_micros - a.cost_micros).slice(0, 8).map((k) => ({ text: k.text, cost: R(k.cost_micros) }));
  const lowQ = kws.filter((k) => k.quality_score !== null && k.quality_score <= T.lowQualityScore && k.cost_micros > 0)
    .sort((a, b) => b.cost_micros - a.cost_micros).slice(0, 8).map((k) => ({ text: k.text, score: k.quality_score as number, cost: R(k.cost_micros) }));
  if (lowQ.length) {
    findings.push({ id: "low_quality", severity: "medium", title: `${lowQ.length} palavras-chave com nota de qualidade baixa e gasto`, detail: lowQ.slice(0, 4).map((k) => `"${k.text}" nota ${k.score}`).join("; ") + ". Nota baixa encarece o clique e piora a posicao." });
  }
  const enabledCampaigns = new Set(input.campaigns.filter((c) => c.status === "ENABLED").map((c) => c.campaign_id));
  const liveAds = input.ads.filter((a) => a.status === "ENABLED" && (a.campaign_id === undefined || enabledCampaigns.has(a.campaign_id)));
  const weak = liveAds.filter((a) => a.ad_strength === "POOR" || a.ad_strength === "AVERAGE").length;
  // So reprovado de verdade em campanha ligada (UNKNOWN e tipos que o Google nao classifica nao entram).
  const notApproved = liveAds.filter((a) => a.approval_status === "DISAPPROVED").length;
  if (notApproved > 0) findings.push({ id: "ads_not_approved", severity: "high", title: `${notApproved} anuncio(s) reprovado(s) em campanha ligada`, detail: "Anuncio reprovado nao circula. Revise as politicas no Google Ads." });

  // Campanha ligada que nao consegue veicular (sem anuncio/palavra-chave/grupo de recursos): gasta zero.
  const notServing: InsightsReport["not_serving"] = [];
  if (input.structure) {
    const reasons = unreadyReasons(input.campaigns.filter((c) => c.status === "ENABLED").map((c) => ({ campaign_id: c.campaign_id, channel_type: c.channel_type ?? null })), input.structure);
    for (const [cid, why] of reasons) notServing.push({ campaign: nameOf.get(cid) ?? String(cid), reasons: why });
    if (notServing.length) {
      findings.push({
        id: "enabled_not_serving", severity: "high",
        title: `${notServing.length} campanha(s) ligada(s) que nao conseguem veicular`,
        detail: notServing.map((n) => `${n.campaign}: ${n.reasons.join("; ")}`).join(" | ") + ". Ligadas assim, nao gastam nada e a verba do plano fica parada.",
      });
    }
  }

  const broken = (input.destinations ?? []).filter((d) => !d.ok).map((d) => ({ url: d.url, status: d.status, ads: d.ads }));
  if (broken.length) {
    findings.push({
      id: "broken_destination", severity: "high",
      title: `${broken.length} pagina(s) de destino de anuncios ligados nao abrem para o Google`,
      detail: broken.slice(0, 4).map((b) => `${b.url.replace(/^https?:\/\/(www\.)?/, "")} (${b.status ?? "sem resposta"}, ${b.ads} anuncio(s))`).join("; ") + ". O Google reprova o anuncio (DESTINATION_NOT_WORKING) e o clique vai para uma pagina quebrada. Corrija a pagina ou troque a URL do anuncio.",
    });
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    generated_at: input.now.toISOString(), brand_terms: input.brandTerms, brand, waste,
    impression_share: impressionShare.sort((a, b) => (b.lost_rank ?? 0) - (a.lost_rank ?? 0)).slice(0, 10),
    devices: dev.map((d) => ({ device: DEVICE_PT[d.key] ?? d.key, cost: R(d.cost), roas: d.roas })),
    weekdays: dayList.map((d) => ({ day: DAY_PT[d.key] ?? d.key, cost: R(d.cost), roas: d.roas })),
    hours: { best: hrs.slice(0, 3).map((h) => ({ hour: Number(h.key), cost: R(h.cost), roas: h.roas })), worst: hrs.slice(-3).map((h) => ({ hour: Number(h.key), cost: R(h.cost), roas: h.roas })) },
    regions,
    products: { top: topProducts, waste: wasteProducts },
    keywords: { waste: kwWaste, low_quality: lowQ },
    ads: { total: liveAds.length, weak, not_approved: notApproved },
    not_serving: notServing,
    broken_destinations: broken,
    findings,
  };
}
