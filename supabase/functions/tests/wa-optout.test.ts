import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isOptoutMessage, optoutPhone } from "../_shared/wa-webhook-optout.ts";
import { brPhoneKey } from "../_shared/br-phone.ts";

Deno.test("SAIR: só a mensagem inteira descadastra", () => {
  for (const t of ["SAIR", "sair", " Sair! ", "Sair 🙏", "PARAR", "stop", "Descadastrar", "não quero receber", "Nao quero mais receber."]) {
    assert(isOptoutMessage(t), t);
  }
  for (const t of ["quero sair", "sair do grupo", "como faço pra sair?", "voltar", "menu", "1", "", "sairr"]) {
    assert(!isOptoutMessage(t), t);
  }
});

Deno.test("brPhoneKey: com e sem o nono dígito viram a mesma chave", () => {
  assertEquals(brPhoneKey("551184221987"), "5511984221987");
  assertEquals(brPhoneKey("5511984221987"), "5511984221987");
  assertEquals(brPhoneKey("+55 (11) 8422-1987"), "5511984221987");
  assertEquals(brPhoneKey("551133334444"), "551133334444"); // fixo não ganha 9
});

Deno.test("optoutPhone: ignora LID e usa o número real", () => {
  assertEquals(optoutPhone({ phone: "123456789@lid", realPhoneFromAlt: null, contact: { phone: "551184221987" } }), "5511984221987");
  assertEquals(optoutPhone({ phone: "123456789@lid", realPhoneFromAlt: null, contact: { phone: "123456789@lid" } }), null);
  assertEquals(optoutPhone({ phone: "5511984221987", realPhoneFromAlt: null, contact: null }), "5511984221987");
});
