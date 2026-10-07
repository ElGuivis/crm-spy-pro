import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildKnowledgeInfo, formatKnowledgeBlock } from "../_shared/ai-chat-knowledge.ts";

Deno.test("sem documentos nao gera bloco", () => {
  assertEquals(formatKnowledgeBlock([]), "");
});

Deno.test("bloco traz titulo, categoria e conteudo", () => {
  const b = formatKnowledgeBlock([{ title: "Troca", category: "politicas", content: "7 dias" }]);
  assertStringIncludes(b, "BASE DE CONHECIMENTO");
  assertStringIncludes(b, "### Troca (politicas)");
  assertStringIncludes(b, "7 dias");
});

Deno.test("conteudo longo e cortado", () => {
  const b = formatKnowledgeBlock([{ title: "T", content: "x".repeat(5000) }]);
  assertEquals(b.includes("x".repeat(1501)), false);
  assertStringIncludes(b, "…");
});

Deno.test("busca usa o tenant e os termos da pergunta; erro devolve vazio", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const make = (result: { data: unknown; error: unknown }) => ({
    rpc: (fn: string, args: Record<string, unknown>) => { calls.push([fn, args]); return Promise.resolve(result); },
  });

  const out = await buildKnowledgeInfo(make({ data: [{ title: "Troca", content: "7 dias" }], error: null }), "tenant-a", "Como funciona a troca?");
  assertStringIncludes(out, "### Troca");
  assertEquals(calls[0][0], "search_knowledge_docs");
  assertEquals(calls[0][1], { p_tenant: "tenant-a", p_terms: ["funciona", "troca"], p_limit: 3 });

  assertEquals(await buildKnowledgeInfo(make({ data: null, error: { message: "x" } }), "t", "troca"), "");
  assertEquals(await buildKnowledgeInfo(make({ data: [], error: null }), "t", "oi tudo bem"), "");
  assertEquals(calls.length, 2, "sem termos uteis nao consulta o banco");
});
