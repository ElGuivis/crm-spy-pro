/**
 * Redator especialista de anuncio responsivo de pesquisa (RSA). A IA so ESCREVE; o servidor:
 *  - entrega a ela o contexto real (buscas que venderam, jeito de falar da marca, fatos verificados no CRM);
 *  - mede a qualidade em codigo (cobertura de palavras-chave, variedade, CTA, tamanho, frases genericas) e, se ficar baixa,
 *    pede UMA reescrita apontando os problemas;
 *  - valida tamanho, repeticao e ofertas inventadas (parseCopy). O dono ainda revisa antes de ir ao ar.
 * A nota e uma ESTIMATIVA interna; a nota final (Ad Strength) e do Google.
 */
import { BUILD, norm } from "./google-ads-build-core.ts";
import { parseCopy } from "./google-ads-ai-copy.ts";

export interface CopyContext {
  brand: string;
  campaignName: string;
  finalUrl: string;
  keywords: string[];                       // palavras-chave ativas da campanha
  topTerms: string[];                       // buscas reais que geraram venda (mais valiosas primeiro)
  voice: string[];                          // trechos de anuncios antigos que venderam (jeito de falar da marca)
  productTypes: string[];                   // tipos de peca vendidos (ex.: Camiseta, Bone)
  facts: string[];                          // fatos verificados no CRM, em frases que podem ser usadas
  colors?: string[];                        // cores realmente vendidas (lidas do SKU dos pedidos entregues), ex.: preto, branco
}

export interface CopyQuality { score: number; label: "Excelente" | "Boa" | "Media" | "Fraca"; issues: string[] }

const GENERIC = ["melhor preco", "o melhor", "as melhores", "alta qualidade", "melhor qualidade", "confira nossos produtos", "clique aqui", "estilo e conforto", "venha conferir", "tudo para voce",
  "moda para voce", "produtos de qualidade", "ofertas imperdiveis", "nao perca", "voce merece", "somos especialistas", "a loja que", "o seu estilo",
  "domine", "cause impacto", "quem manda", "eleve seu", "vibe autentica", "mostre quem", "seja a voz", "destaque-se", "na loja", "compra ja"];
/** Afirmacoes subjetivas ou nao comprovadas: o texto e descartado, a menos que o dado fornecido use a mesma palavra. */
const UNSUPPORTED = ["rapid", "premium", "confortav", "conforto", "qualidade", "melhor", "incrivel", "perfeit", "pronta entrega", "imediat", "unico", "garantid", "sinta a diferenca", "estiloso", "exclusiv", "limitad", "edicao", "satisfeit", "domine", "asfalto", " top", "real "];
/** Promessas de prazo/numero que os dados nao trazem: "em ate 48h", "ate 3 dias", "5 dias". */
const PROMISE = /\b(ate|em ate)\s*\d+|\b\d+\s*(h|horas?|dias?|min)\b/;
/** Cores: so podem aparecer no texto se a loja realmente vende (stem sem genero: pret = preto/preta). */
const COLOR_STEMS = ["pret", "branc", "verd", "marrom", "vermelh", "beg", "rox", "cinz", "azul", "amarel", "vinh", "ros", "laranj"];
const colorStem = (c: string) => COLOR_STEMS.find((s) => norm(c).startsWith(s));
const CTA = ["compre", "garanta", "confira", "veja", "escolha", "descubra", "peca", "monte", "vista", "use", "entre", "conheca", "leve"];
const STOP = new Set(["de", "da", "do", "e", "a", "o", "em", "para", "com", "no", "na", "os", "as", "um", "uma", "por"]);

const words = (t: string) => norm(t).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return A.size + B.size - inter === 0 ? 0 : inter / (A.size + B.size - inter);
};
const hasTerm = (text: string, term: string) => {
  const t = norm(text), k = norm(term);
  if (t.includes(k)) return true;
  const kw = words(term);
  return kw.length >= 2 && kw.every((w) => t.includes(w));
};

/** Estima a forca do anuncio (0-100). Pontua o que o Google premia: volume, palavras-chave nos titulos, variedade, tamanho e CTA. */
export function scoreRsa(headlines: string[], descriptions: string[], ctx: CopyContext): CopyQuality {
  const issues: string[] = [];
  let score = 0;
  const H = headlines.length, D = descriptions.length;

  score += Math.min(H / BUILD.maxHeadlines, 1) * 20;
  if (H < BUILD.maxHeadlines) issues.push(`Use ${BUILD.maxHeadlines} titulos (hoje ${H}): quanto mais variacoes, melhor a nota.`);
  score += Math.min(D / BUILD.maxDescriptions, 1) * 10;
  if (D < BUILD.maxDescriptions) issues.push(`Use ${BUILD.maxDescriptions} descricoes (hoje ${D}).`);

  const kws = [...ctx.topTerms.slice(0, 6), ...ctx.keywords.slice(0, 8)].filter(Boolean);
  const hKw = headlines.filter((h) => kws.some((k) => hasTerm(h, k))).length;
  score += Math.min(hKw / 6, 1) * 15;
  if (hKw < 6) issues.push(`So ${hKw} titulo(s) trazem o que as pessoas pesquisam; coloque as buscas reais (${kws.slice(0, 4).join(", ")}) em pelo menos 6 titulos, de formas diferentes.`);
  const dKw = descriptions.filter((d) => kws.some((k) => hasTerm(d, k))).length;
  score += Math.min(dKw / 2, 1) * 5;
  if (dKw < 2) issues.push("Pelo menos 2 descricoes devem citar o produto/busca principal.");

  const brandN = headlines.filter((h) => norm(h).includes(norm(ctx.brand))).length;
  score += Math.min(brandN / 2, 1) * 5;
  if (brandN < 2) issues.push(`Cite a marca "${ctx.brand}" em pelo menos 2 titulos.`);

  let similar = 0;
  const hw = headlines.map(words);
  for (let i = 0; i < hw.length; i++) for (let j = i + 1; j < hw.length; j++) if (jaccard(hw[i], hw[j]) >= 0.6) similar++;
  score += 15 * Math.max(0, 1 - similar / 4);
  if (similar > 0) issues.push(`${similar} par(es) de titulos sao quase iguais; cada titulo precisa dizer algo diferente.`);

  const avgH = H ? headlines.reduce((s, h) => s + h.length, 0) / H : 0;
  const avgD = D ? descriptions.reduce((s, d) => s + d.length, 0) / D : 0;
  score += Math.min(avgH / 22, 1) * 5 + Math.min(avgD / 75, 1) * 5;
  if (avgH < 22) issues.push("Titulos curtos demais: use mais dos 30 caracteres para dizer algo concreto.");
  if (avgD < 75) issues.push("Descricoes curtas: use perto dos 90 caracteres (beneficio + produto + chamada para acao).");

  const ctaN = [...headlines, ...descriptions].filter((t) => CTA.some((c) => words(t).includes(c))).length;
  score += Math.min(ctaN / 3, 1) * 10;
  if (ctaN < 3) issues.push("Faltam chamadas para acao (Compre, Veja, Garanta, Confira...) em pelo menos 3 textos.");

  const spec = headlines.filter((h) => ctx.productTypes.some((p) => words(h).includes(norm(p))) || ctx.facts.some((f) => words(f).some((w) => w.length > 4 && words(h).includes(w)))).length;
  score += Math.min(spec / 3, 1) * 5;
  if (spec < 3) issues.push("Cite tipos de peca reais (" + ctx.productTypes.slice(0, 3).join(", ") + ") ou um fato verificado em pelo menos 3 titulos.");

  const bare = headlines.filter((h) => {
    const w = words(h);
    const known = new Set([...words(ctx.brand), ...kws.flatMap(words), ...ctx.productTypes.flatMap(words), ...(ctx.colors ?? []).flatMap((c) => [norm(c), norm(c).replace(/o$/, "a")]), "streetwear", "masculina", "masculino", "feminina", "estampa", "estampada", "camisas", "camisetas", "camisa", "camiseta"]);
    return w.length > 0 && w.every((x) => known.has(x)) && !CTA.some((c) => w.includes(c));
  });
  score -= Math.min(Math.max(0, bare.length - 4) * 3, 12);
  if (bare.length > 4) issues.push(`${bare.length} titulos sao so o nome do produto (ex.: "${bare[0]}"). Deixe no maximo 4 assim; nos outros junte o produto a uma acao (Compre, Veja, Garanta) ou a um fato verificado.`);

  const generic = [...headlines, ...descriptions].filter((t) => GENERIC.some((g) => norm(t).includes(g)));
  score -= Math.min(generic.length * 5, 20);
  if (generic.length) issues.push(`Frases genericas: ${generic.slice(0, 3).map((g) => `"${g}"`).join(", ")}. Troque por algo especifico da marca.`);

  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { score: s, label: s >= 85 ? "Excelente" : s >= 70 ? "Boa" : s >= 50 ? "Media" : "Fraca", issues };
}

const SYSTEM = `Voce e redator senior de anuncios responsivos de pesquisa do Google (RSA), especialista em SEO de anuncio e em moda streetwear brasileira. Escreve em portugues do Brasil, na voz da marca, para quem JA PESQUISOU o que a marca vende.

OBJETIVO: maximizar relevancia (nota "Excelente" do Google) e cliques de verdade, sem enrolacao.

COMO ESCREVER:
- Gere exatamente 15 titulos (ate 30 caracteres cada) e 4 descricoes (entre 75 e 90 caracteres).
- Distribua os 15 titulos assim: 6 titulos construidos em volta das BUSCAS REAIS fornecidas (use a expressao que a pessoa digita, em formas diferentes: singular/plural, com a marca, com o tipo de peca); 3 titulos de identidade, na voz da marca; 3 titulos de produto especifico (tipo de peca real); 2 titulos de chamada para acao (Compre, Veja, Garanta...); 1 titulo com um FATO VERIFICADO.
- Os 6 titulos de busca NAO podem ser so o nome do produto: no maximo 3 assim ("Camiseta Chronic Streetwear"); os outros juntam a busca a uma acao ou a um fato verificado ("Compre Camiseta Chronic Online", "Camisetas Chronic: Pague com Pix").
- Cores: so cite cor se estiver em CORES QUE A LOJA VENDE. Nunca invente cor.
- Descricoes: cada uma junta beneficio concreto + produto + chamada para acao. Nenhuma pode repetir a outra.
- Cada titulo diz uma coisa DIFERENTE. Nada de variar so uma palavra.
- Fale como a marca fala: curto, direto, com atitude. Use o jeito de falar dos "TEXTOS QUE JA VENDERAM" como referencia de tom, mas NAO copie frases deles.
- Proibido texto generico ou exagerado ("melhor preco", "alta qualidade", "confira nossos produtos", "estilo e conforto", "clique aqui", "domine a cena", "cause impacto", "eleve seu visual", "mostre quem manda"). Se nao der para ser especifico, nao escreva.
- Escreva a marca com a inicial maiuscula, exatamente como fornecida. Nada de "oficial", "original", "exclusivo", "autentico".
- Cada titulo tem entre 22 e 30 caracteres (aproveite o espaco). Cada descricao tem entre 78 e 90.
- Titulos soam como ANUNCIO DE VERDADE, nao como lista de palavras: "Camiseta Chronic Streetwear" (bom), "Chronic camiseta na loja" (ruim). Descricoes sao frases completas e naturais, com um beneficio real e uma chamada para acao curta no fim.
- No maximo um titulo terminando em "agora" ou "ja".

REGRAS DE SEGURANCA (violar = texto descartado):
- Use SOMENTE a marca, as buscas, os tipos de peca e os FATOS VERIFICADOS fornecidos. Nao invente frete gratis, prazo, desconto, promocao, preco, cupom, garantia, estoque, colecao, ano, premio, "oficial", "original" ou numeros.
- Proibido drogas ou o numero 420. Proibido nomes de pessoas famosas ou marcas de terceiros.
- Sem emojis, sem MAIUSCULAS em excesso, no maximo 1 exclamacao no conjunto, sem pontuacao no fim dos titulos.

Responda APENAS com JSON valido: {"headlines": ["..."], "descriptions": ["..."]}`;

export function buildAgentMessages(c: CopyContext, feedback?: { previous: { headlines: string[]; descriptions: string[] }; issues: string[] }) {
  const user = [
    `MARCA: ${c.brand}`,
    `CAMPANHA: ${c.campaignName}`,
    `PAGINA DE DESTINO: ${c.finalUrl}`,
    c.topTerms.length ? `BUSCAS REAIS QUE JA GERARAM VENDA (use no SEO, da mais valiosa para a menos): ${c.topTerms.slice(0, 10).join("; ")}` : "",
    c.keywords.length ? `PALAVRAS-CHAVE DA CAMPANHA: ${c.keywords.slice(0, 15).join("; ")}` : "",
    c.productTypes.length ? `TIPOS DE PECA REAIS DA LOJA: ${c.productTypes.join("; ")}` : "",
    c.colors?.length ? `CORES QUE A LOJA VENDE (unicas que pode citar): ${c.colors.join("; ")}` : "CORES: nao cite nenhuma cor.",
    c.facts.length ? `FATOS VERIFICADOS (pode usar): ${c.facts.join(" | ")}` : "FATOS VERIFICADOS: nenhum. Nao cite frete, parcelamento, prazo nem numeros.",
    c.voice.length ? `TEXTOS QUE JA VENDERAM (so para pegar o tom, nao copie):\n- ${c.voice.slice(0, 10).join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: SYSTEM }, { role: "user", content: user }];
  if (feedback) {
    msgs.push({ role: "assistant", content: JSON.stringify(feedback.previous) });
    msgs.push({ role: "user", content: `Sua versao ficou com estes problemas:\n- ${feedback.issues.join("\n- ")}\nReescreva o conjunto inteiro corrigindo TODOS, mantendo as regras. Responda so o JSON.` });
  }
  return msgs;
}

/** Tira dos textos o que e generico ou promete algo que os dados nao sustentam. Devolve o que sobrou e o motivo de cada descarte. */
export function stripWeak(list: string[], allowed: string): { kept: string[]; dropped: string[] } {
  const a = norm(allowed);
  const kept: string[] = [], dropped: string[] = [];
  for (const t of list) {
    const k = norm(t);
    const g = GENERIC.find((x) => k.includes(x));
    const col = words(t).map((w) => (COLOR_STEMS.some((s) => w.startsWith(s)) ? w : "")).find((w) => w && !a.split(/[^a-z]+/).some((x) => x.startsWith(COLOR_STEMS.find((s) => w.startsWith(s))!)));
    const u = UNSUPPORTED.find((x) => k.includes(x) && !a.includes(x));
    if (g) dropped.push(`${t} (generico: "${g}")`);
    else if (col) dropped.push(`${t} (cor "${col}" nao consta nas vendas da loja)`);
    else if (PROMISE.test(k) && !PROMISE.test(a)) dropped.push(`${t} (prazo/numero sem base nos dados)`);
    else if (u) dropped.push(`${t} (promessa sem base nos dados: "${u}")`);
    else kept.push(t);
  }
  return { kept, dropped };
}

/** Acabamento deterministico: marca sempre com a grafia certa e inicial maiuscula (a IA erra isso com frequencia). */
export function polish(text: string, brand: string): string {
  const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const t = text.replace(/\s+/g, " ").trim().replace(new RegExp(`\\b${esc}\\b`, "gi"), brand);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface DraftResult { ok: true; headlines: string[]; descriptions: string[]; dropped: string[]; quality: CopyQuality; attempts: number }

/**
 * Gera, mede e (no maximo uma vez) reescreve. `callModel` devolve o texto bruto da IA. Fica com a melhor versao valida.
 */
export async function draftBestCopy(
  ctx: CopyContext, callModel: (msgs: ReturnType<typeof buildAgentMessages>) => Promise<{ ok: true; text: string } | { ok: false; error: string }>,
  targetScore = 80,
): Promise<DraftResult | { ok: false; error: string }> {
  const allowed = [ctx.brand, ctx.campaignName, ...ctx.keywords, ...ctx.topTerms, ...ctx.productTypes, ...ctx.facts, ...(ctx.colors ?? [])].join(" ");
  let best: DraftResult | null = null;
  let lastError = "A IA nao respondeu";
  let feedback: Parameters<typeof buildAgentMessages>[1];
  for (let attempt = 1; attempt <= 2; attempt++) { // 2 tentativas: o plano gratuito da Groq limita 8.000 tokens por minuto
    const r = await callModel(buildAgentMessages(ctx, feedback));
    if (!r.ok) { lastError = r.error; break; }
    const p = parseCopy(r.text, allowed);
    if (!p.ok) { lastError = p.error; if (best) break; feedback = undefined; continue; }
    const h = stripWeak(p.headlines.map((x) => polish(x, ctx.brand)), allowed), d = stripWeak(p.descriptions.map((x) => polish(x, ctx.brand)), allowed);
    const dropped = [...p.dropped, ...h.dropped, ...d.dropped];
    const quality = scoreRsa(h.kept, d.kept, ctx);
    const enough = h.kept.length >= BUILD.minHeadlines && d.kept.length >= BUILD.minDescriptions;
    if (enough && (!best || quality.score > best.quality.score)) best = { ok: true, headlines: h.kept, descriptions: d.kept, dropped, quality, attempts: attempt };
    if (enough && quality.score >= targetScore && h.kept.length >= 12 && d.kept.length >= 3) break;
    const issues = [...(dropped.length ? [`Estes textos foram DESCARTADOS pelas regras, troque por outros limpos: ${dropped.slice(0, 6).join(" | ")}`] : []), ...quality.issues].slice(0, 7);
    feedback = { previous: { headlines: h.kept, descriptions: d.kept }, issues };
  }
  return best ?? { ok: false, error: lastError };
}
