/** Monta o contexto REAL do redator: buscas que venderam, tom da marca (anuncios antigos) e fatos verificados no CRM. So leitura. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { norm } from "./google-ads-build-core.ts";
import type { CopyContext } from "./google-ads-copy-agent.ts";

/** Trechos com estes sinais nao entram como "tom da marca" nem como busca: sao oferta, droga ou promocao que podem nao valer mais. */
const RISKY = ["420", "maconha", "droga", "frete", "desconto", "promo", "cupom", "gratis", "off", "black", "sem juros", "parcel", "garantia", "estoque", "%", "oficial", "original", "imediato", "24h", "ate "];

export interface CopyFacts { delivered_orders: number; states_delivered: number; pix_orders_12m: number; card_installment_pct: number | null; product_types: string[] }

/** Fatos em frases prontas. So entram os que os dados sustentam. */
export function factsToSentences(f: CopyFacts): string[] {
  const out: string[] = [];
  if (f.states_delivered >= 20) out.push("Entrega para todo o Brasil");
  if ((f.card_installment_pct ?? 0) >= 30) out.push("Parcele no cartao");
  if (f.pix_orders_12m >= 50) out.push("Pague com Pix");
  if (f.delivered_orders >= 1000) out.push(`+${Math.floor(f.delivered_orders / 1000)} mil pedidos entregues`);
  return out;
}

export function cleanVoice(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.replace(/[®™]/g, "").replace(/\s+/g, " ").trim();
    const k = norm(t);
    if (t.length < 14 || seen.has(k) || RISKY.some((r) => k.includes(r))) continue;
    seen.add(k); out.push(t);
  }
  return out;
}

export function cleanTerms(terms: string[], campaignWords: string[]): string[] {
  const sig = new Set(campaignWords.map(norm).filter((w) => w.length > 3));
  const ok = terms.filter((t) => !RISKY.some((r) => norm(t).includes(r)));
  const related = ok.filter((t) => norm(t).split(/\s+/).some((w) => sig.has(w)));
  return (related.length >= 3 ? related : ok).slice(0, 10);
}

export async function loadCopyContext(
  supabase: SupabaseClient, a: { accountId: string; campaignId: number; brand: string; campaignName: string; finalUrl: string; keywords: string[] },
): Promise<CopyContext> {
  const [terms, ads, facts] = await Promise.all([
    supabase.rpc("google_ads_term_top", { p_account: a.accountId, p_order: "revenue", p_limit: 80 }),
    supabase.from("google_ads_ads").select("headlines, descriptions, conversions_value").eq("account_id", a.accountId)
      .eq("approval_status", "APPROVED").not("headlines", "is", null).order("conversions_value", { ascending: false }).limit(8),
    supabase.rpc("google_ads_copy_facts", { p_account: a.accountId }),
  ]);
  const f = (facts.data ?? {}) as Partial<CopyFacts>;
  const voiceRaw = ((ads.data ?? []) as Array<{ headlines: string[] | null; descriptions: string[] | null }>).flatMap((x) => [...(x.headlines ?? []), ...(x.descriptions ?? [])]);
  const campaignWords = [...a.campaignName.split(/\W+/), ...a.keywords.flatMap((k) => k.split(/\W+/))];
  return {
    brand: a.brand.charAt(0).toUpperCase() + a.brand.slice(1), campaignName: a.campaignName, finalUrl: a.finalUrl,
    keywords: a.keywords.filter((k) => !RISKY.some((r) => norm(k).includes(r))).slice(0, 15),
    topTerms: cleanTerms(((terms.data ?? []) as Array<{ search_term: string }>).map((t) => t.search_term), campaignWords),
    voice: cleanVoice(voiceRaw).slice(0, 12),
    productTypes: (f.product_types ?? []).map(String),
    facts: factsToSentences({
      delivered_orders: Number(f.delivered_orders ?? 0), states_delivered: Number(f.states_delivered ?? 0), pix_orders_12m: Number(f.pix_orders_12m ?? 0),
      card_installment_pct: f.card_installment_pct == null ? null : Number(f.card_installment_pct), product_types: [],
    }),
  };
}
