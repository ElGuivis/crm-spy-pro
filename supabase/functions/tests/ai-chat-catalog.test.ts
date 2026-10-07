import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAvailableProductsInfo, extractSearchTerms, formatCatalogBlock, lastContactQuestion } from "../_shared/ai-chat-catalog.ts";

Deno.test("termos: tira acento, stopwords e palavras curtas", () => {
  assertEquals(extractSearchTerms("Oi, quanto custa a camiseta plus size?"), ["camiseta", "plus", "size"]);
  assertEquals(extractSearchTerms("vocês vendem boné?"), ["bone"]);
  assertEquals(extractSearchTerms("oi tudo bem"), []);
  assertEquals(extractSearchTerms("a b c"), []);
});

Deno.test("termos: frases reais da conversa de teste (07/10) nao viram termos de produto", () => {
  assertEquals(extractSearchTerms("Não precisa mas tem camiseta oversized?"), ["camiseta", "oversized"]);
  assertEquals(extractSearchTerms("O que você tem em estoque hoje?"), []);
  assertEquals(extractSearchTerms("Quais camisetas vocês têm agora?"), ["camisetas"]);
});

Deno.test("termos: limita a 4 e remove repetidos", () => {
  assertEquals(extractSearchTerms("camiseta camiseta verde preta azul rosa amarela").length, 4);
});

Deno.test("ultima pergunta do contato pela data, ignorando o bot", () => {
  const h = [
    { sender_type: "contact", content: "primeira", created_at: "2026-01-01T10:00:00Z" },
    { sender_type: "contact", content: "ultima", created_at: "2026-01-01T10:05:00Z" },
    { sender_type: "bot", content: "resposta", created_at: "2026-01-01T10:06:00Z" },
  ];
  assertEquals(lastContactQuestion(h), "ultima");
  assertEquals(lastContactQuestion([]), "");
});

Deno.test("bloco: sem resultado em busca manda nao citar produto", () => {
  assertStringIncludes(formatCatalogBlock([], true), "Não cite produto");
  assertEquals(formatCatalogBlock([], false), "");
});

Deno.test("bloco: com resultado manda citar so os listados", () => {
  const b = formatCatalogBlock(["- A: R$ 10,00 | 2 em estoque"], true);
  assertStringIncludes(b, "- A: R$ 10,00");
  assertStringIncludes(b, "SOMENTE estes");
});

type RpcCall = { fn: string; args: Record<string, unknown> };

/** Cliente falso: rpc devolve conjuntos em fila e registra as chamadas. */
function fakeRpc(sets: unknown[][], calls: RpcCall[]) {
  let i = 0;
  return {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: sets[Math.min(i++, sets.length - 1)], error: null });
    },
  };
}

const liStore = { type: "loja_integrada", tables: { products: "li_products" } } as never;

Deno.test("LI: chama a funcao do tenant com os termos e formata promocao", async () => {
  const calls: RpcCall[] = [];
  const db = fakeRpc([[
    { name: "Camiseta X", price: 100, promotional_price: 80, stock: 3 },
    { name: "Bone Y", price: 50, promotional_price: null, stock: 1 },
  ]], calls);
  const out = await buildAvailableProductsInfo(db, liStore, "t1", "camiseta");
  assertStringIncludes(out, "- Camiseta X: R$ 80,00 (de R$ 100,00) | 3 em estoque");
  assertStringIncludes(out, "- Bone Y: R$ 50,00 | 1 em estoque");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "search_available_products");
  assertEquals(calls[0].args, { p_tenant: "t1", p_terms: ["camiseta"], p_mode: "all", p_limit: 20 });
});

Deno.test("LI: sem resultado com todos os termos, tenta qualquer um", async () => {
  const calls: RpcCall[] = [];
  const db = fakeRpc([[], [{ name: "Calca Moletom Preto", price: 139.9, promotional_price: null, stock: 1 }]], calls);
  const out = await buildAvailableProductsInfo(db, liStore, "t1", "moletom preto");
  assertStringIncludes(out, "- Calca Moletom Preto: R$ 139,90 | 1 em estoque");
  assertEquals(calls.map((c) => c.args.p_mode), ["all", "any"]);
});

Deno.test("LI: sem termos lista os com mais estoque (limite 10) sem segunda tentativa", async () => {
  const calls: RpcCall[] = [];
  await buildAvailableProductsInfo(fakeRpc([[]], calls), liStore, "t1", "oi");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].args.p_terms, []);
  assertEquals(calls[0].args.p_limit, 10);
});
