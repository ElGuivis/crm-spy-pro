/**
 * Rascunho de anuncio responsivo de pesquisa com IA (tipo B). A IA so ESCREVE; o dono revisa e edita antes de qualquer envio
 * ao Google, e o servidor valida tamanho, repeticao e trechos pendentes. Prompt travado contra invencao de ofertas.
 */
import { BUILD, norm } from "./google-ads-build-core.ts";

export interface CopyInput {
  brand: string;
  campaignName: string;
  keywords: string[];
  products: string[];
  finalUrl: string;
}

const SYSTEM = `Voce escreve anuncios de pesquisa do Google (anuncio responsivo) em portugues do Brasil para uma loja de moda.

REGRAS OBRIGATORIAS:
- Use SOMENTE a marca, as palavras-chave e os nomes de produtos fornecidos. Nao conhece a loja alem disso.
- PROIBIDO mencionar drogas ou o numero 420 (politica do Google). PROIBIDO inventar: frete, prazo, desconto, promocao, preco, cupom, garantia, estoque limitado, colecao, ano, temporada, premiacao, "oficial" ou qualquer afirmacao que nao esteja nos dados.
- Titulos: de 8 a 10, cada um com NO MAXIMO 30 caracteres, todos diferentes, sem pontuacao final, no maximo 1 exclamacao no conjunto.
- Descricoes: 3, cada uma com NO MAXIMO 90 caracteres.
- Sem emojis, sem LETRAS MAIUSCULAS EM EXCESSO, sem repetir a mesma palavra mais de 2 vezes no mesmo texto.
- Foque em ajudar quem pesquisa as palavras-chave a achar o que procura (nome da marca, tipo de peca).

Responda APENAS com JSON valido, sem texto antes ou depois, neste formato:
{"headlines": ["..."], "descriptions": ["..."]}`;

export function buildCopyMessages(i: CopyInput): Array<{ role: "system" | "user"; content: string }> {
  const user = [
    `MARCA: ${i.brand}`,
    `CAMPANHA: ${i.campaignName}`,
    `PALAVRAS-CHAVE (o que as pessoas pesquisam): ${i.keywords.slice(0, 12).join("; ")}`,
    i.products.length ? `PRODUTOS QUE MAIS VENDEM (nomes reais): ${i.products.slice(0, 5).join("; ")}` : "",
    `PAGINA DE DESTINO: ${i.finalUrl}`,
  ].filter(Boolean).join("\n");
  return [{ role: "system", content: SYSTEM }, { role: "user", content: user }];
}

/** Palavras que indicam oferta inventada; se aparecerem sem estar nos dados fornecidos, o texto e descartado. */
/** NUNCA permitido, nem que apareca nos dados da conta (politica do Google sobre drogas). */
const HARD_BAN = /\b(420|maconha|cannabis|baseado|erva|drogas?)\b/i;

const CLAIMS = ["maconha", "cannabis", "baseado", "oficial", "original", "autentic", "exclusiv", "frete", "desconto", "promocao", "promo", "cupom", "garantia", "estoque", "colecao", "oferta", "gratis", "gratuito", "liquidacao", "black friday", "% off", "sem juros", "parcel"];

export function parseCopy(raw: string, allowedText: string): { ok: true; headlines: string[]; descriptions: string[]; dropped: string[] } | { ok: false; error: string } {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "A IA nao devolveu JSON" };
  let obj: { headlines?: unknown; descriptions?: unknown };
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); } catch { return { ok: false, error: "JSON da IA invalido" }; }
  if (!Array.isArray(obj.headlines) || !Array.isArray(obj.descriptions)) return { ok: false, error: "A IA nao devolveu titulos e descricoes" };

  const allowed = norm(allowedText);
  const dropped: string[] = [];
  const keep = (list: unknown[], max: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of list) {
      const t = String(x ?? "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
      const k = norm(t);
      if (!t || seen.has(k)) continue;
      if (t.length > max) { dropped.push(`${t} (passa de ${max})`); continue; }
      if (/\[[^\]]*\]/.test(t)) { dropped.push(`${t} (trecho entre colchetes)`); continue; }
      if (HARD_BAN.test(t)) { dropped.push(`${t} (termo proibido pela politica do Google)`); continue; }
      const claim = CLAIMS.find((c) => k.includes(c) && !allowed.includes(c));
      if (claim) { dropped.push(`${t} (afirmacao nao sustentada: "${claim}")`); continue; }
      seen.add(k); out.push(t);
    }
    return out;
  };
  const headlines = keep(obj.headlines, BUILD.headlineMax).slice(0, BUILD.maxHeadlines);
  const descriptions = keep(obj.descriptions, BUILD.descriptionMax).slice(0, BUILD.maxDescriptions);
  if (headlines.length < BUILD.minHeadlines || descriptions.length < BUILD.minDescriptions) {
    return { ok: false, error: `Poucos textos validos (${headlines.length} titulos, ${descriptions.length} descricoes) depois de descartar o que nao passou nas regras` };
  }
  return { ok: true, headlines, descriptions, dropped };
}
