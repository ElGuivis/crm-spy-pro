import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildStoreProfileBlock, fetchStoreProfile, GROUNDING_RULES } from "../_shared/ai-chat-store-profile.ts";

Deno.test("perfil vazio ou ausente nao gera bloco", () => {
  assertEquals(buildStoreProfileBlock(null), "");
  assertEquals(buildStoreProfileBlock(undefined), "");
  assertEquals(buildStoreProfileBlock({ about: "   ", policies: {} }), "");
});

Deno.test("perfil preenchido gera so os campos informados", () => {
  const block = buildStoreProfileBlock({
    store_name: "Loja Teste",
    sells: "camisetas e bonés",
    does_not_sell: "calçados",
    policies: { shipping: "Envio em 2 dias úteis", returns: "  ", unknown_key: "ignorada" },
  });
  assertStringIncludes(block, "PERFIL DA LOJA:");
  assertStringIncludes(block, "Nome da loja: Loja Teste");
  assertStringIncludes(block, "O que vendemos: camisetas e bonés");
  assertStringIncludes(block, "O que NÃO vendemos: calçados");
  assertStringIncludes(block, "Frete e prazos: Envio em 2 dias úteis");
  assertEquals(block.includes("Trocas e devoluções:"), false);
  assertEquals(block.includes("ignorada"), false);
  // o que falta aparece como NAO CADASTRADO, nunca como dado
  assertStringIncludes(block, "NÃO CADASTRADO");
  assertStringIncludes(block, "Trocas e devoluções");
  assertEquals(block.split("NÃO CADASTRADO")[1].includes("Frete e prazos"), false);
});

Deno.test("regras de aterramento proíbem inventar", () => {
  assertStringIncludes(GROUNDING_RULES, "Nunca invente");
});

Deno.test("fetchStoreProfile filtra pelo tenant e tolera erro", async () => {
  const seen: Array<[string, unknown]> = [];
  const fake = (result: { data: unknown; error: unknown }) => ({
    from: (table: string) => {
      seen.push(["from", table]);
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => { seen.push([col, val]); return chain; },
        maybeSingle: () => Promise.resolve(result),
      };
      return chain;
    },
  });

  const ok = await fetchStoreProfile(fake({ data: { about: "x" }, error: null }), "tenant-a");
  assertEquals(ok, { about: "x" });
  assertEquals(seen, [["from", "tenant_business_profiles"], ["tenant_id", "tenant-a"]]);

  assertEquals(await fetchStoreProfile(fake({ data: null, error: { message: "boom" } }), "t"), null);
  assertEquals(await fetchStoreProfile(fake({ data: null, error: null }), "t"), null);
});
