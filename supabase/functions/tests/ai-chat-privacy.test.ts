import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { customerOwnsPhone, customerPhones, formatCustomerMinimal } from "../_shared/ai-chat-privacy.ts";

Deno.test("telefones do cadastro: so os ultimos 9 digitos, ignora vazios", () => {
  assertEquals(customerPhones({ celular: "(18) 99613-3808", telefone: null, telefone_celular: "123" }), ["996133808"]);
  assertEquals(customerPhones({}), []);
});

Deno.test("dono do telefone: confere com ou sem 55 e mascara", () => {
  const c = { telefone_celular: "18996133808" };
  assertEquals(customerOwnsPhone(c, "5518996133808"), true);
  assertEquals(customerOwnsPhone(c, "+55 (18) 99613-3808"), true);
  assertEquals(customerOwnsPhone(c, "5511988887777"), false);
});

Deno.test("sem telefone no cadastro ou no contato nunca e dono", () => {
  assertEquals(customerOwnsPhone({ nome: "Maria" }, "5518996133808"), false);
  assertEquals(customerOwnsPhone({ celular: "18996133808" }, ""), false);
  assertEquals(customerOwnsPhone({ celular: "18996133808" }, "123"), false);
});

Deno.test("bloco do cliente tem so nome e cidade, nunca CPF, e-mail, rua ou telefone", () => {
  const out = formatCustomerMinimal({
    nome: "Maria Souza",
    endereco_cidade: "Campinas",
    endereco_estado: "SP",
    // campos que nunca podem aparecer (o tipo ignora, mas o objeto real do banco traz tudo)
    ...({ cpf: "12345678900", email: "maria@x.com", endereco_logradouro: "Rua Secreta", endereco_cep: "13000000", telefone_celular: "18996133808" } as Record<string, string>),
  });
  assertStringIncludes(out, "Maria Souza");
  assertStringIncludes(out, "Campinas/SP");
  for (const leak of ["12345678900", "maria@x.com", "Rua Secreta", "13000000", "996133808"]) {
    assertEquals(out.includes(leak), false, `vazou ${leak}`);
  }
});

Deno.test("endereco do Bling usa municipio/uf", () => {
  assertStringIncludes(formatCustomerMinimal({ name: "Ana", endereco: { municipio: "Recife", uf: "PE", cep: "5000" } }), "Recife/PE");
});
