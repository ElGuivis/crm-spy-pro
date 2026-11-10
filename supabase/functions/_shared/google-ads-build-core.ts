/**
 * Propostas de CONSTRUCAO a partir dos dados (tipo A, sem IA): palavras negativas e reconstrucao da estrutura de campanhas
 * de Pesquisa que nao veiculam. Funcoes puras: validam e montam o que sera proposto; quem escreve no Google e o apply.
 */

export const BUILD = {
  maxNegativesPerRun: 20,
  negativeMinCost: 30,            // R$ gasto sem conversao para virar candidato
  maxKeywordsPerCampaign: 25,
  minKeywordRevenue: 1,           // so palavras que ja geraram receita
  minKeywordCost: 20,             // R$: evita palavra com 1 clique de sorte
  maxKeywordChars: 80,
  maxKeywordWords: 10,
  headlineMax: 30, descriptionMax: 90,
  minHeadlines: 3, maxHeadlines: 15, minDescriptions: 2, maxDescriptions: 4,
} as const;

export type MatchType = "EXACT" | "PHRASE" | "BROAD";

/** Normaliza para comparar termos (minusculas, sem acento, espacos unicos). */
export const norm = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function validateKeywordText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, error: "palavra-chave vazia" };
  if (t.length > BUILD.maxKeywordChars) return { ok: false, error: `palavra-chave acima de ${BUILD.maxKeywordChars} caracteres` };
  if (t.split(" ").length > BUILD.maxKeywordWords) return { ok: false, error: `palavra-chave com mais de ${BUILD.maxKeywordWords} palavras` };
  if (/[!@%,*()=+{}\[\]\\<>?;:~`|^]/.test(t)) return { ok: false, error: "palavra-chave com simbolo nao permitido" };
  return { ok: true, text: t };
}

export interface RsaDraft { headlines: string[]; descriptions: string[]; final_url: string }

/** Valida um anuncio responsivo de pesquisa antes de enviar ao Google. Devolve a lista de problemas (vazia = ok). */
export function validateRsa(d: RsaDraft): string[] {
  const errs: string[] = [];
  const h = (d.headlines ?? []).map((x) => String(x).trim()).filter(Boolean);
  const ds = (d.descriptions ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (h.length < BUILD.minHeadlines) errs.push(`minimo de ${BUILD.minHeadlines} titulos`);
  if (h.length > BUILD.maxHeadlines) errs.push(`maximo de ${BUILD.maxHeadlines} titulos`);
  if (ds.length < BUILD.minDescriptions) errs.push(`minimo de ${BUILD.minDescriptions} descricoes`);
  if (ds.length > BUILD.maxDescriptions) errs.push(`maximo de ${BUILD.maxDescriptions} descricoes`);
  h.forEach((x, i) => { if (x.length > BUILD.headlineMax) errs.push(`titulo ${i + 1} passa de ${BUILD.headlineMax} caracteres`); });
  ds.forEach((x, i) => { if (x.length > BUILD.descriptionMax) errs.push(`descricao ${i + 1} passa de ${BUILD.descriptionMax} caracteres`); });
  if (new Set(h.map(norm)).size !== h.length) errs.push("titulos repetidos");
  if ([...h, ...ds].some((x) => /\[[^\]]*\]/.test(x))) errs.push("ainda ha trecho entre colchetes (ex.: [preencher oferta]) para completar");
  if ([...h, ...ds].some((x) => /(.)\1{4,}/.test(x) || /[!]{2,}/.test(x))) errs.push("texto com repeticao excessiva ou varias exclamacoes (politica do Google)");
  if (!/^https:\/\/[^\s]+$/i.test(d.final_url ?? "")) errs.push("URL final invalida (precisa comecar com https://)");
  return errs;
}

export interface TermAgg { campaign_id: number; term: string; cost: number; conversions: number; value: number }
export interface NegativeProposal { campaign_id: number; text: string; match_type: "EXACT"; cost: number; clicks_hint?: number }

/**
 * Termos que gastaram e nunca converteram viram negativa EXATA na campanha onde mais gastaram.
 * Nunca propoe termo que contenha a marca (pode so precisar de pagina melhor) nem o que ja e negativa.
 */
export function buildNegativeProposals(
  rows: TermAgg[], brandTerms: string[], existingNegatives: Set<string>, enabledCampaigns: Set<number>,
): NegativeProposal[] {
  const brand = brandTerms.map(norm).filter((b) => b.length >= 2);
  const byTerm = new Map<string, { total: number; conv: number; best: TermAgg }>();
  for (const r of rows) {
    const k = norm(r.term);
    const e = byTerm.get(k) ?? { total: 0, conv: 0, best: r };
    e.total += r.cost; e.conv += r.conversions;
    if (r.cost > e.best.cost) e.best = r;
    byTerm.set(k, e);
  }
  const out: NegativeProposal[] = [];
  for (const [k, e] of [...byTerm.entries()].sort((a, b) => b[1].total - a[1].total)) {
    if (e.conv > 0 || e.total < BUILD.negativeMinCost) continue;
    if (brand.some((b) => k.includes(b))) continue;
    if (!enabledCampaigns.has(e.best.campaign_id)) continue;
    if (existingNegatives.has(`${e.best.campaign_id}|${k}`)) continue;
    const v = validateKeywordText(e.best.term);
    if (!v.ok) continue;
    out.push({ campaign_id: e.best.campaign_id, text: v.text, match_type: "EXACT", cost: Math.round(e.total * 100) / 100 });
    if (out.length >= BUILD.maxNegativesPerRun) break;
  }
  return out;
}

export interface HistKeyword { text: string; match_type: string | null; cost: number; value: number }
export interface KeywordProposal { text: string; match_type: MatchType; source: "historico" | "termo"; value: number }

/**
 * Palavras-chave para reconstruir uma campanha: as que ja geraram receita (BROAD vira FRASE, mais seguro) e os termos que
 * converteram nela (EXATA). Descarta as que ja estao ligadas em OUTRA campanha ligada (competiria com voce mesmo).
 */
export function buildKeywordProposals(
  hist: HistKeyword[], convertingTerms: Array<{ term: string; value: number; cost: number }>, usedElsewhere: Set<string>,
): KeywordProposal[] {
  const seen = new Set<string>();
  const out: KeywordProposal[] = [];
  const add = (text: string, match: MatchType, source: KeywordProposal["source"], value: number) => {
    const v = validateKeywordText(text);
    if (!v.ok) return;
    const key = `${norm(v.text)}|${match}`;
    if (seen.has(key) || usedElsewhere.has(norm(v.text))) return;
    seen.add(key);
    out.push({ text: v.text, match_type: match, source, value });
  };
  for (const k of [...hist].sort((a, b) => b.value - a.value)) {
    if (k.value < BUILD.minKeywordRevenue || k.cost < BUILD.minKeywordCost) continue;
    const m = (k.match_type ?? "PHRASE") as MatchType;
    add(k.text, m === "BROAD" ? "PHRASE" : m, "historico", k.value);
  }
  for (const t of [...convertingTerms].sort((a, b) => b.value - a.value)) {
    if (t.value < BUILD.minKeywordRevenue || t.cost < BUILD.minKeywordCost) continue;
    add(t.term, "EXACT", "termo", t.value);
  }
  return out.sort((a, b) => b.value - a.value).slice(0, BUILD.maxKeywordsPerCampaign);
}
