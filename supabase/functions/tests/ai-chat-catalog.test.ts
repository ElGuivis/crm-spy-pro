import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAvailableProductsInfo, extractSearchTerms, formatCatalogBlock } from "../_shared/ai-chat-catalog.ts";

Deno.test("termos: tira acento, stopwords e palavras curtas", () => {
  assertEquals(extractSearchTerms("Oi, quanto custa a camiseta plus size?"), ["camiseta", "plus", "size"]);
  assertEquals(extractSearchTerms("vocês vendem boné?"), ["bone"]);
  assertEquals(extractSearchTerms("oi tudo bem"), []);
  assertEquals(extractSearchTerms("a b c"), []);
});

Deno.test("termos: limita a 4 e remove repetidos", () => {
  assertEquals(extractSearchTerms("camiseta camiseta verde preta azul rosa amarela").length, 4);
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

function fakeSupabase(rows: unknown[] | unknown[][], log: Array<[string, unknown?]>) {
  const chain: Record<string, unknown> = {};
  let call = 0;
  for (const m of ["select", "eq", "gt", "ilike", "or", "order", "limit"]) {
    chain[m] = (...a: unknown[]) => {
      log.push([m, a[0]]);
      if (m === "limit") {
        const set = Array.isArray(rows[0]) ? (rows as unknown[][])[Math.min(call++, rows.length - 1)] : rows;
        return Promise.resolve({ data: set, error: null });
      }
      return chain;
    };
  }
  return { from: (t: string) => { log.push(["from", t]); return chain; } };
}

const liStore = { type: "loja_integrada", tables: { products: "li_products" } } as never;

Deno.test("LI: filtra tenant, ativo e estoque, e formata promocao", async () => {
  const log: Array<[string, unknown?]> = [];
  const db = fakeSupabase([
    { name: "Camiseta X", price: 100, promotional_price: 80, stock: 3 },
    { name: "Bone Y", price: 50, promotional_price: null, stock: 1 },
  ], log);
  const out = await buildAvailableProductsInfo(db, liStore, "t1", "camiseta");
  assertStringIncludes(out, "- Camiseta X: R$ 80,00 (de R$ 100,00) | 3 em estoque");
  assertStringIncludes(out, "- Bone Y: R$ 50,00 | 1 em estoque");
  const calls = log.map((l) => l.join(":"));
  assertEquals(calls.includes("from:li_products"), true);
  assertEquals(calls.includes("eq:tenant_id"), true);
  assertEquals(calls.includes("eq:active"), true);
  assertEquals(calls.includes("gt:stock"), true);
  assertEquals(calls.includes("ilike:name"), true);
});

Deno.test("LI: sem resultado com todos os termos, tenta qualquer um", async () => {
  const log: Array<[string, unknown?]> = [];
  const db = fakeSupabase([[], [{ name: "Calca Moletom Preto", price: 139.9, promotional_price: null, stock: 1 }]], log);
  const out = await buildAvailableProductsInfo(db, liStore, "t1", "moletom preto");
  assertStringIncludes(out, "- Calca Moletom Preto: R$ 139,90 | 1 em estoque");
  const calls = log.map((l) => l[0]);
  assertEquals(calls.filter((c) => c === "ilike").length, 2);
  assertEquals(calls.includes("or"), true);
});

Deno.test("LI: sem termos nao filtra por nome", async () => {
  const log: Array<[string, unknown?]> = [];
  await buildAvailableProductsInfo(fakeSupabase([], log), liStore, "t1", "oi");
  assertEquals(log.some((l) => l[0] === "or"), false);
});
