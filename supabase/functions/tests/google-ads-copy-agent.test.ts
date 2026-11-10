import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAgentMessages, draftBestCopy, polish, scoreRsa, stripWeak, type CopyContext } from "../_shared/google-ads-copy-agent.ts";
import { cleanTerms, cleanVoice, factsToSentences } from "../_shared/google-ads-copy-context.ts";

const CTX: CopyContext = {
  brand: "Chronic", campaignName: "[PESQUISA] - CAMISETAS CHRONIC", finalUrl: "https://www.usechronic.com.br/camisetas",
  keywords: ["camiseta chronic", "camisa chronic", "chronic camisetas"], topTerms: ["chronic camiseta", "camisa chronic", "camiseta chronic", "chronic camisetas"],
  voice: ["Muito rua pra ser streetwear"], productTypes: ["Camiseta", "Bone"], facts: ["Entrega para todo o Brasil", "Parcele no cartao", "Pague com Pix"],
};

const GOOD = {
  headlines: [
    "Camiseta Chronic Streetwear", "Camisa Chronic Preta", "Chronic Camisetas de Rua", "Compre Camiseta Chronic", "Camisas Chronic com Estampa",
    "Chronic Camiseta Masculina", "Muito Rua pra Ser Streetwear", "Atitude em Cada Estampa", "Camiseta Preta Streetwear", "Bone e Camiseta Chronic",
    "Garanta a Sua Chronic", "Veja Todas as Camisetas", "Pague com Pix", "Entrega para todo o Brasil", "Chronic: Roupa de Rua",
  ],
  descriptions: [
    "Camisetas Chronic com estampa forte e atitude de rua. Escolha a sua e vista Chronic hoje.",
    "Camisa Chronic para quem vive o streetwear: varias estampas, uma so identidade. Confira.",
    "Parcele no cartao ou pague com Pix e receba sua camiseta Chronic em todo o Brasil.",
    "Do Bone a Camiseta, a Chronic veste quem tem o que dizer. Veja os modelos e garanta o seu.",
  ],
};
const WEAK = {
  headlines: ["Melhor preco", "Alta qualidade", "Roupas", "Confira nossos produtos", "Clique aqui"],
  descriptions: ["Os melhores produtos para voce com alta qualidade.", "Venha conferir tudo para voce."],
};

Deno.test("nota: anuncio especifico, com buscas reais e CTA, passa de 85; anuncio generico fica fraco e lista os problemas", () => {
  const good = scoreRsa(GOOD.headlines, GOOD.descriptions, CTX);
  assert(good.score >= 85, `score ${good.score}: ${good.issues.join(" | ")}`);
  assertEquals(good.label, "Excelente");
  const weak = scoreRsa(WEAK.headlines, WEAK.descriptions, CTX);
  assert(weak.score < 50, `score ${weak.score}`);
  assertEquals(weak.label, "Fraca");
  assert(weak.issues.some((i) => i.includes("genericas")));
  assert(weak.issues.some((i) => i.includes("15 titulos")));
});

Deno.test("titulos quase iguais derrubam a nota", () => {
  const same = GOOD.headlines.map((_, i) => (i % 2 ? "Camiseta Chronic Preta" : "Camiseta Chronic Preta Nova") + (i > 1 ? ` ${i}` : ""));
  const q = scoreRsa(same, GOOD.descriptions, CTX);
  assert(q.issues.some((i) => i.includes("quase iguais")));
});

const modelReturning = (...outputs: Array<unknown>) => {
  let n = 0;
  return { calls: () => n, fn: (msgs: unknown[]) => { void msgs; const o = outputs[Math.min(n, outputs.length - 1)]; n++; return Promise.resolve(o as { ok: true; text: string } | { ok: false; error: string }); } };
};

Deno.test("redator: texto bom de primeira nao pede reescrita", async () => {
  const m = modelReturning({ ok: true, text: JSON.stringify(GOOD) });
  const r = await draftBestCopy(CTX, m.fn);
  assert(r.ok && r.quality.score >= 80);
  assertEquals(m.calls(), 1);
});

Deno.test("redator: nota baixa pede UMA reescrita com os problemas e fica com a melhor versao", async () => {
  const seen: string[] = [];
  const outputs = [{ ok: true, text: JSON.stringify({ headlines: GOOD.headlines.slice(0, 4), descriptions: GOOD.descriptions.slice(0, 2) }) }, { ok: true, text: JSON.stringify(GOOD) }];
  let i = 0;
  const r = await draftBestCopy(CTX, (msgs) => { seen.push(msgs.map((x) => x.content).join("\n")); return Promise.resolve(outputs[i++] as { ok: true; text: string }); });
  assert(r.ok);
  assertEquals(i, 2);
  assert(seen[1].includes("problemas") && seen[1].includes("15 titulos"));
  assertEquals(r.ok && r.attempts, 2);
  assert(r.ok && r.headlines.length === 15);
});

Deno.test("redator: erro da IA ou JSON invalido vira erro claro; oferta inventada e descartada", async () => {
  const bad = await draftBestCopy(CTX, modelReturning({ ok: false, error: "A IA nao respondeu" }).fn);
  assert(!bad.ok);
  const nojson = await draftBestCopy(CTX, modelReturning({ ok: true, text: "oi" }).fn);
  assert(!nojson.ok);
  const claim = { headlines: [...GOOD.headlines.slice(0, 13), "Frete gratis hoje", "Cupom de 10 por cento"], descriptions: GOOD.descriptions };
  const r = await draftBestCopy(CTX, modelReturning({ ok: true, text: JSON.stringify(claim) }).fn);
  assert(r.ok && r.dropped.some((d) => d.includes("frete")) && !r.headlines.some((h) => h.toLowerCase().includes("frete")));
});

Deno.test("fatos: so entram os que os dados sustentam", () => {
  assertEquals(factsToSentences({ delivered_orders: 5523, states_delivered: 26, pix_orders_12m: 400, card_installment_pct: 84, product_types: [] }),
    ["Entrega para todo o Brasil", "Parcele no cartao", "Pague com Pix", "+5 mil pedidos entregues"]);
  assertEquals(factsToSentences({ delivered_orders: 300, states_delivered: 5, pix_orders_12m: 3, card_installment_pct: 10, product_types: [] }), []);
});

Deno.test("tom da marca e buscas: tiram oferta, 420, cupom e promocao", () => {
  const v = cleanVoice(["Muito rua pra ser streetwear", "Chronic 420 Black Week", "Pague em até 3x Sem Juros", "Chronic ®", "Original e Marginal", "Novo drop disponível. Confira", "Muito rua pra ser streetwear"]);
  assertEquals(v, ["Muito rua pra ser streetwear", "Novo drop disponível. Confira"]);
  const t = cleanTerms(["chronic", "chronic camiseta", "cupom de desconto chronic", "camisa chronic", "chronic 420", "camiseta chronic", "chronic camisetas"], ["Camisetas", "Chronic"]);
  assert(!t.some((x) => x.includes("cupom") || x.includes("420")));
  assert(t.includes("chronic camiseta") && t.includes("camisa chronic"));
});

Deno.test("prompt leva o contexto real e a reescrita leva a versao anterior", () => {
  const m = buildAgentMessages(CTX);
  assertEquals(m.length, 2);
  assert(m[1].content.includes("BUSCAS REAIS") && m[1].content.includes("FATOS VERIFICADOS") && m[1].content.includes("Entrega para todo o Brasil"));
  assert(m[0].content.includes("15 titulos") && m[0].content.includes("generico"));
  const f = buildAgentMessages(CTX, { previous: { headlines: ["a"], descriptions: ["b"] }, issues: ["faltou X"] });
  assertEquals(f.length, 4);
  assert(f[3].content.includes("faltou X"));
});

Deno.test("termos proibidos (420, drogas) e 'oficial' saem mesmo que estejam nas palavras-chave da conta", async () => {
  const ctx = { ...CTX, keywords: [...CTX.keywords, "chronic 420"], topTerms: [...CTX.topTerms, "chronic 420"] };
  const out = { headlines: [...GOOD.headlines.slice(0, 12), "Camisa Chronic 420", "Chronic camiseta oficial", "Camiseta Original Chronic"], descriptions: GOOD.descriptions };
  const r = await draftBestCopy(ctx, modelReturning({ ok: true, text: JSON.stringify(out) }).fn);
  assert(r.ok);
  assert(r.ok && !r.headlines.some((h) => /420|oficial|original/i.test(h)), "nenhum texto proibido passa");
  assertEquals(r.ok && r.dropped.length, 3, JSON.stringify(r.ok && r.dropped));
});

Deno.test("texto bombastico e 'na loja' perdem nota", () => {
  const h = ["Chronic camiseta na loja", "Domine a cena com Chronic", ...GOOD.headlines.slice(2)];
  const q = scoreRsa(h, ["Eleve seu visual com a camiseta Chronic e cause impacto. Compre agora e confira.", ...GOOD.descriptions.slice(1)], CTX);
  assert(q.issues.some((i) => i.includes("genericas")));
});

Deno.test("stripWeak descarta generico e promessa sem base, mas aceita a palavra se o dado a usa", () => {
  const w = ["Camiseta Chronic de rua", "Camiseta de alta qualidade", "Entrega rapida para voce", "Pague com Pix"];
  const a = stripWeak(w, "Chronic Camiseta Pix");
  assertEquals(a.kept, ["Camiseta Chronic de rua", "Pague com Pix"]);
  assertEquals(a.dropped.length, 2);
  assertEquals(stripWeak(["Entrega rapida garantida"], "entrega rapida").kept.length, 0); // garantida nao esta nos dados
  assertEquals(stripWeak(["Entrega rapida em SP"], "entrega rapida").kept.length, 1);                // dado usa a mesma palavra
});

Deno.test("redator: textos fracos da IA sao descartados e a reescrita recebe o motivo", async () => {
  const weak = { headlines: [...GOOD.headlines.slice(0, 10), "Camiseta de alta qualidade", "Entrega rapida e premium"], descriptions: [...GOOD.descriptions.slice(0, 3), "Os melhores produtos para voce"] };
  const seen: string[] = [];
  const outs = [{ ok: true, text: JSON.stringify(weak) }, { ok: true, text: JSON.stringify(GOOD) }];
  let i = 0;
  const r = await draftBestCopy(CTX, (msgs) => { seen.push(msgs.map((x) => x.content).join("\n")); return Promise.resolve(outs[Math.min(i++, 1)] as { ok: true; text: string }); });
  assert(r.ok && r.headlines.length === 15);
  assert(seen[1].includes("DESCARTADOS") && seen[1].includes("alta qualidade"));
});

Deno.test("polish: marca com a grafia certa e inicial maiuscula", () => {
  assertEquals(polish("chronic camiseta streetwear", "Chronic"), "Chronic camiseta streetwear");
  assertEquals(polish("use CHRONIC camiseta preta", "Chronic"), "Use Chronic camiseta preta");
  assertEquals(polish("  camiseta   chronic  ", "Chronic"), "Camiseta Chronic");
});

Deno.test("prazo e numero inventados saem; o que esta nos dados fica", () => {
  const a = stripWeak(["Receba em ate 48h", "Chega em 3 dias", "Camiseta Chronic Preta", "Edicao limitada Chronic"], "Chronic Camiseta");
  assertEquals(a.kept, ["Camiseta Chronic Preta"]);
  assertEquals(stripWeak(["Receba em ate 48h"], "ate 48h").kept.length, 1);
});
