import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPermanentReason, normEmail, normPhone } from "./contact-policy.ts";

Deno.test("telefone: normaliza para 55 + DDD + número e recusa inválidos", () => {
  assertEquals(normPhone("(11) 99999-8888"), "5511999998888");
  assertEquals(normPhone("+55 11 99999-8888"), "5511999998888");
  assertEquals(normPhone("011999998888"), "5511999998888");
  assertEquals(normPhone("1133334444"), "551133334444");
  assertEquals(normPhone("123"), null);
  assertEquals(normPhone(null), null);
});

Deno.test("e-mail: minúsculas, espaços e sem arroba vira nulo", () => {
  assertEquals(normEmail("  Maria@Email.COM "), "maria@email.com");
  assertEquals(normEmail("sem-arroba"), null);
  assertEquals(normEmail(undefined), null);
});

Deno.test("motivos: supressão e bloqueio são permanentes; limite e prioridade passam com o tempo", () => {
  assertEquals(isPermanentReason("suppressed"), true);
  assertEquals(isPermanentReason("blocked"), true);
  assertEquals(isPermanentReason("daily_cap"), false);
  assertEquals(isPermanentReason("priority_gap"), false);
});
