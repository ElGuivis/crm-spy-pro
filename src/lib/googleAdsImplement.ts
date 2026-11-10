/**
 * Liga cada alerta/achado/aviso da tela à proposta que o resolve (ou explica por que nao ha botao).
 * Regra de ouro: so existe botao quando o sistema consegue FAZER a mudanca com seguranca (travas no servidor, conferencia depois,
 * desfazer). Quando nao consegue, mostra o motivo, em vez de um botao que nao faz nada.
 */

export interface Suggestion {
  id: string;
  kind: string;
  agent: string;
  status: string;
  title: string;
  rationale: string;
  error: string | null;
  payload: Record<string, unknown> & { campaign_id?: number; needs_copy?: boolean; new_ad?: unknown; category?: string; origin?: string };
}

export const PLAN_KINDS = ["adjust_budget", "enable_campaign", "pause_campaign"];

export const byKind = (s: Suggestion[], ...kinds: string[]) => s.filter((x) => kinds.includes(x.kind));
export const forCampaign = (s: Suggestion[], campaignId: number) => s.filter((x) => Number(x.payload.campaign_id) === campaignId);

/** Motivos pelos quais algumas sugestoes nao tem botao (o sistema nao tem como, ou nao deve, fazer sozinho). */
export const MANUAL_REASON: Record<string, string> = {
  brand_dependence: "Sem botão: o passo é criar alcance fora da marca (campanha nova de Shopping/remarketing), que depende de decisão sua sobre oferta e público.",
  non_brand_weak: "Sem botão: buscas genéricas não se pagam; o caminho é outro formato de campanha, que depende de decisão sua.",
  rank_limited: "Sem botão: o gargalo é posição no leilão; com lances automáticos não há um ajuste seguro a fazer sozinho. Melhore anúncios e páginas.",
  device_skew: "Sem botão: lances automáticos ignoram ajuste por dispositivo, então não há o que implementar.",
  weekday_skew: "Sem botão: lances automáticos ignoram ajuste por dia da semana, então não há o que implementar.",
  product_waste: "Sem botão: tirar produtos do Shopping exige editar o feed ou os grupos de produtos (Merchant Center).",
  low_quality: "Sem botão: a nota sobe melhorando anúncio e página; não há ajuste automático seguro.",
  broken_destination: "Sem botão: o conserto é no site (a página precisa abrir) ou trocar a URL do anúncio.",
};

export const ALERT_MANUAL: Record<string, string> = {
  R1: "Ação sua: repor o crédito em Google Ads → Faturamento. O sistema não mexe em pagamento.",
  R2: "Ação sua: repor o crédito em Google Ads → Faturamento antes de acabar. O sistema não mexe em pagamento.",
  R4: "Ação sua: resolver a situação da conta/faturamento dentro do Google Ads. O sistema não mexe nisso.",
};

/** Propostas que resolvem um achado das Descobertas. */
export function recsForFinding(id: string, s: Suggestion[]): Suggestion[] {
  if (id === "negative_candidates") return byKind(s, "add_negative_keywords");
  if (id === "enabled_not_serving" || id === "ads_not_approved") return byKind(s, "rebuild_search_structure");
  return [];
}

/** Propostas que resolvem um alerta do diagnostico (dedupe_key "R3:<conta>:<campanha>", "R7:<conta>"...). */
export function recsForAlert(dedupeKey: string | null, s: Suggestion[]): Suggestion[] {
  const rule = (dedupeKey ?? "").split(":")[0];
  if (rule === "R7") return byKind(s, ...PLAN_KINDS).filter((x) => x.kind !== "enable_campaign");
  if (rule === "R3") {
    const cid = Number((dedupeKey ?? "").split(":")[2]);
    const rebuild = byKind(forCampaign(s, cid), "rebuild_search_structure");
    return rebuild.length ? rebuild : byKind(forCampaign(s, cid), "pause_campaign");
  }
  return [];
}

export const alertRule = (dedupeKey: string | null) => (dedupeKey ?? "").split(":")[0];
