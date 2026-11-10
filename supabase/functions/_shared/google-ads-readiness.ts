/**
 * Prontidao para veicular: uma campanha so gasta se tiver estrutura ativa (grupo de anuncios, anuncio aprovado, palavra-chave;
 * na Performance Max, um grupo de recursos). Funcao pura sobre dados ja sincronizados. Resultado `null` = nao da para saber
 * (tipo de campanha nao verificado ou estrutura ainda nao sincronizada): nesse caso quem chama NAO bloqueia nada.
 */

export interface RdCampaign { campaign_id: number; channel_type: string | null }
export interface RdAdGroup { campaign_id: number; ad_group_id: number; status: string }
export interface RdAd { campaign_id: number; ad_group_id: number; status: string; approval_status: string | null }
export interface RdKeyword { campaign_id: number; ad_group_id: number; status: string; negative: boolean }
export interface RdAssetGroup { campaign_id: number; status: string }

export interface Structure { adGroups: RdAdGroup[]; ads: RdAd[]; keywords: RdKeyword[]; assetGroups: RdAssetGroup[] }
export interface Readiness { ready: boolean | null; reasons: string[] }

export function campaignReadiness(c: RdCampaign, s: Structure): Readiness {
  if (c.channel_type === "PERFORMANCE_MAX") {
    const groups = s.assetGroups.filter((g) => g.campaign_id === c.campaign_id);
    if (!groups.length) return { ready: null, reasons: [] };
    return groups.some((g) => g.status === "ENABLED")
      ? { ready: true, reasons: [] }
      : { ready: false, reasons: ["nenhum grupo de recursos ligado"] };
  }
  if (c.channel_type !== "SEARCH") return { ready: null, reasons: [] };

  const groups = s.adGroups.filter((g) => g.campaign_id === c.campaign_id);
  if (!groups.length) return { ready: null, reasons: [] }; // estrutura nao sincronizada: nao arrisca opiniao
  const on = new Set(groups.filter((g) => g.status === "ENABLED").map((g) => g.ad_group_id));
  const reasons: string[] = [];
  if (!on.size) return { ready: false, reasons: ["nenhum grupo de anuncios ligado"] };
  // O anuncio e a palavra-chave precisam estar no MESMO grupo ligado.
  const adOk = new Set(s.ads.filter((a) => on.has(a.ad_group_id) && a.status === "ENABLED" && a.approval_status !== "DISAPPROVED").map((a) => a.ad_group_id));
  const kwOk = new Set(s.keywords.filter((k) => on.has(k.ad_group_id) && k.status === "ENABLED" && !k.negative).map((k) => k.ad_group_id));
  if (!adOk.size) reasons.push("nenhum anuncio ligado e aprovado");
  if (!kwOk.size) reasons.push("nenhuma palavra-chave ligada");
  if (!reasons.length && ![...adOk].some((g) => kwOk.has(g))) reasons.push("os anuncios e as palavras-chave ligados estao em grupos diferentes");
  return { ready: reasons.length === 0, reasons };
}

/** Mapa campanha -> motivos de nao veicular (so as que SABEMOS que nao veiculam). */
export function unreadyReasons(campaigns: RdCampaign[], s: Structure): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const c of campaigns) {
    const r = campaignReadiness(c, s);
    if (r.ready === false) out.set(c.campaign_id, r.reasons);
  }
  return out;
}
