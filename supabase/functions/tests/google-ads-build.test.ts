import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildKeywordProposals, buildNegativeProposals, norm, validateKeywordText, validateRsa } from "../_shared/google-ads-build-core.ts";

Deno.test("norm: minusculas, sem acento, espacos unicos", () => assertEquals(norm("  Camiseta  CHRONIC Ação "), "camiseta chronic acao"));

Deno.test("validateKeywordText: recusa simbolos, vazio, muito longo e muitas palavras", () => {
  assertEquals(validateKeywordText("  camiseta   chronic "), { ok: true, text: "camiseta chronic" });
  assert(!validateKeywordText("").ok);
  assert(!validateKeywordText("camiseta!").ok);
  assert(!validateKeywordText("a b c d e f g h i j k").ok);
  assert(!validateKeywordText("x".repeat(81)).ok);
});

const good = { headlines: ["Camiseta Chronic", "Chronic Oficial", "Moda Streetwear"], descriptions: ["Camisetas e bonés da marca Chronic.", "Veja a linha completa no site oficial."], final_url: "https://loja.example/camisetas" };

Deno.test("validateRsa: anuncio valido passa; limites, repeticao, colchetes e URL sao barrados", () => {
  assertEquals(validateRsa(good), []);
  assert(validateRsa({ ...good, headlines: ["a", "b"] }).some((e) => e.includes("minimo de 3 titulos")));
  assert(validateRsa({ ...good, headlines: ["x".repeat(31), "b", "c"] }).some((e) => e.includes("passa de 30")));
  assert(validateRsa({ ...good, descriptions: ["x".repeat(91), "ok"] }).some((e) => e.includes("passa de 90")));
  assert(validateRsa({ ...good, headlines: ["Igual", "igual", "Outro"] }).some((e) => e.includes("repetidos")));
  assert(validateRsa({ ...good, descriptions: ["Aproveite [preencher oferta]", "ok ok"] }).some((e) => e.includes("colchetes")));
  assert(validateRsa({ ...good, final_url: "http://x.com" }).some((e) => e.includes("URL")));
  assert(validateRsa({ ...good, headlines: ["Compre!!", "b b", "c c"] }).some((e) => e.includes("exclamacoes")));
});

Deno.test("negativas: so termos sem conversao, sem a marca, com gasto minimo, em campanha ligada e ainda nao negativados", () => {
  const rows = [
    { campaign_id: 1, term: "roupas masculinas", cost: 43, conversions: 0, value: 0 },
    { campaign_id: 1, term: "roupa chronic", cost: 63, conversions: 0, value: 0 },      // marca
    { campaign_id: 1, term: "barato", cost: 5, conversions: 0, value: 0 },              // pouco gasto
    { campaign_id: 1, term: "camiseta lisa", cost: 80, conversions: 2, value: 200 },     // converteu
    { campaign_id: 2, term: "moda atacado", cost: 50, conversions: 0, value: 0 },       // campanha pausada
    { campaign_id: 1, term: "loja ja negativada", cost: 60, conversions: 0, value: 0 },
    { campaign_id: 1, term: "site aprovando na hora", cost: 35, conversions: 0, value: 0 },
    { campaign_id: 3, term: "site aprovando na hora", cost: 20, conversions: 0, value: 0 },
  ];
  const out = buildNegativeProposals(rows, ["chronic", "cronic"], new Set(["1|loja ja negativada"]), new Set([1, 3]));
  assertEquals(out.map((o) => o.text), ["site aprovando na hora", "roupas masculinas"]);
  assertEquals(out[0].campaign_id, 1); // campanha onde mais gastou
  assertEquals(out[0].cost, 55);       // soma das campanhas
  assert(out.every((o) => o.match_type === "EXACT"));
});

Deno.test("palavras-chave: BROAD vira FRASE, usa termos que converteram como EXATA, tira as ja usadas em outra campanha e ordena por receita", () => {
  const hist = [
    { text: "chronic", match_type: "BROAD", cost: 7881, value: 56295 },
    { text: "camiseta chronic", match_type: "EXACT", cost: 252, value: 1189 },
    { text: "pouca amostra", match_type: "BROAD", cost: 5, value: 900 },
    { text: "sem receita", match_type: "BROAD", cost: 400, value: 0 },
    { text: "so na outra campanha", match_type: "PHRASE", cost: 300, value: 800 },
  ];
  const terms = [{ term: "chronic camiseta", value: 1139, cost: 153 }, { term: "Camiseta Chronic", value: 100, cost: 50 }];
  const out = buildKeywordProposals(hist, terms, new Set(["so na outra campanha"]));
  assertEquals(out.map((k) => `${k.text}|${k.match_type}|${k.source}`), [
    "chronic|PHRASE|historico", "camiseta chronic|EXACT|historico", "chronic camiseta|EXACT|termo",
  ]);
});
