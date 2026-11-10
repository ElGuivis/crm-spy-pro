/**
 * Edicao do rascunho de uma proposta de construcao. O usuario so pode ESCOLHER entre o que os dados propuseram
 * (subconjunto de termos/palavras/anuncios) e escrever o texto do anuncio novo. Nao aceita termo ou palavra nova que
 * os dados nao tenham proposto: a proposta e baseada em historico real, nao em digitacao livre.
 */
import { norm } from "./google-ads-build-core.ts";

type Payload = Record<string, unknown>;
export type DraftResult = { ok: true; payload: Payload } | { ok: false; error: string };

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const strList = (v: unknown, maxItems: number, maxLen: number): string[] | null =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => isStr(x, maxLen)) ? (v as string[]).map((x) => x.trim()).filter(Boolean) : null;

export function sanitizeDraftPatch(kind: string, current: Payload, patch: unknown): DraftResult {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, error: "patch invalido" };
  const p = patch as Payload;
  const next: Payload = { ...current };

  if (kind === "add_negative_keywords") {
    if (p.terms !== undefined) {
      const terms = strList(p.terms, 20, 80);
      if (!terms) return { ok: false, error: "terms invalido" };
      const allowed = new Set(((current.terms as string[]) ?? []).map(norm));
      if (terms.some((t) => !allowed.has(norm(t)))) return { ok: false, error: "So e possivel manter termos que os dados propuseram" };
      next.terms = terms;
    }
    return { ok: true, payload: next };
  }

  if (kind === "rebuild_search_structure") {
    if (p.keywords !== undefined) {
      if (!Array.isArray(p.keywords) || p.keywords.length > 25) return { ok: false, error: "keywords invalido" };
      const allowed = new Map(((current.keywords as Array<{ text: string; match_type: string }>) ?? []).map((k) => [`${norm(k.text)}|${k.match_type}`, k]));
      const picked: unknown[] = [];
      for (const k of p.keywords as Array<{ text?: unknown; match_type?: unknown }>) {
        const hit = allowed.get(`${norm(String(k?.text ?? ""))}|${String(k?.match_type)}`);
        if (!hit) return { ok: false, error: "So e possivel manter palavras-chave que os dados propuseram" };
        picked.push(hit);
      }
      next.keywords = picked;
    }
    if (p.enable_ad_ids !== undefined) {
      const allowed = new Set(((current.enable_ad_ids as number[]) ?? []).map(Number));
      if (!Array.isArray(p.enable_ad_ids) || p.enable_ad_ids.some((i) => !allowed.has(Number(i)))) return { ok: false, error: "enable_ad_ids invalido" };
      next.enable_ad_ids = (p.enable_ad_ids as number[]).map(Number);
    }
    if (p.new_ad !== undefined) {
      if (p.new_ad === null) next.new_ad = null;
      else {
        const a = p.new_ad as Payload;
        const headlines = strList(a?.headlines, 15, 100);
        const descriptions = strList(a?.descriptions, 4, 200);
        if (!headlines || !descriptions || !isStr(a?.final_url, 500)) return { ok: false, error: "new_ad invalido" };
        next.new_ad = { headlines, descriptions, final_url: String(a.final_url).trim() };
        next.needs_copy = false;
      }
    }
    return { ok: true, payload: next };
  }
  return { ok: false, error: "Tipo de proposta nao editavel" };
}
