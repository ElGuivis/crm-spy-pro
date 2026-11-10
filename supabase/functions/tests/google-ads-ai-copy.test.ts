import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCopyMessages, parseCopy } from "../_shared/google-ads-ai-copy.ts";

const allowed = "Chronic camiseta chronic loja roupas masculinas Camiseta Chronic - Bike Night";
const raw = (o: unknown) => "Aqui esta:\n```json\n" + JSON.stringify(o) + "\n```";

Deno.test("prompt do anuncio: traz so marca, palavras e produtos reais e proibe inventar oferta", () => {
  const m = buildCopyMessages({ brand: "Chronic", campaignName: "Camisetas", keywords: ["chronic loja", "chronic 420"], products: ["Camiseta Chronic - Bike Night"], finalUrl: "https://x.com" });
  assert(m[0].content.includes("PROIBIDO inventar"));
  assert(m[1].content.includes("chronic loja; chronic 420"));
  assert(m[1].content.includes("Bike Night"));
});

Deno.test("parseCopy: extrai JSON mesmo com texto em volta e limpa pontuacao final e repetidos", () => {
  const r = parseCopy(raw({ headlines: ["Camiseta Chronic.", "Chronic Loja", "chronic loja", "Roupas Masculinas"], descriptions: ["Camisetas e boes da marca Chronic.", "Veja a linha completa no site."] }), allowed);
  assert(r.ok);
  if (r.ok) { assertEquals(r.headlines, ["Camiseta Chronic", "Chronic Loja", "Roupas Masculinas"]); assertEquals(r.descriptions.length, 2); }
});

Deno.test("parseCopy: descarta titulo grande, colchetes e oferta inventada (frete, desconto, colecao)", () => {
  const r = parseCopy(raw({
    headlines: ["x".repeat(31), "Chronic Loja", "Frete Gratis Chronic", "Colecao 2026 Chronic", "Camiseta Chronic", "Roupas Masculinas", "Oferta [preencher]"],
    descriptions: ["Desconto exclusivo na loja", "Camisetas e roupas masculinas da Chronic.", "Encontre sua peca na loja Chronic."],
  }), allowed);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.headlines, ["Chronic Loja", "Camiseta Chronic", "Roupas Masculinas"]);
    assertEquals(r.descriptions.length, 2);
    assert(r.dropped.length >= 5);
  }
});

Deno.test("parseCopy: palavra de oferta que esta nos dados fornecidos nao e descartada", () => {
  const r = parseCopy(raw({ headlines: ["Loja Chronic", "Camiseta Chronic", "Chronic Cupom"], descriptions: ["Camisetas da marca Chronic.", "Veja tudo na loja Chronic."] }), allowed + " cupom chronic");
  assert(r.ok);
});

Deno.test("parseCopy: falha clara quando nao ha JSON, JSON quebrado ou sobram poucos textos", () => {
  assert(!parseCopy("sem json aqui", allowed).ok);
  assert(!parseCopy("{ quebrado", allowed).ok);
  const few = parseCopy(raw({ headlines: ["Chronic Loja"], descriptions: ["Uma descricao"] }), allowed);
  assert(!few.ok && few.error.includes("Poucos textos"));
});
