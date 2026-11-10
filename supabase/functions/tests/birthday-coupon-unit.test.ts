import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { birthdayVars, buildBirthdaySpec, fillBirthday } from "../_shared/birthday-coupon.ts";

const base = { coupon_discount_percent: 10 };
const o = { validade: "2026-12-01", descricao: "x" };

Deno.test("padrao: percentual, nao acumulativo, sem minimo, pessoal quando ha cliente", () => {
  const s = buildBirthdaySpec(base, { ...o, liCustomerId: "123" });
  assertEquals([s.tipo, s.valor, s.cumulativo, s.valorMinimo, s.clientes], ["porcentagem", 10, false, null, [123]]);
});
Deno.test("acumulativo, minimo e teto", () => {
  const s = buildBirthdaySpec({ ...base, cumulative: true, min_order_value: 150, max_discount_value: 40 }, o);
  assertEquals([s.cumulativo, s.valorMinimo, s.limiteDesconto], [true, 150, 40]);
});
Deno.test("valor fixo e frete gratis ignoram % e teto", () => {
  const f = buildBirthdaySpec({ ...base, coupon_type: "fixo", coupon_fixed_value: 25, max_discount_value: 40 }, o);
  assertEquals([f.tipo, f.valor, f.limiteDesconto], ["fixo", 25, undefined]);
  const g = buildBirthdaySpec({ ...base, coupon_type: "frete_gratis" }, o);
  assertEquals([g.tipo, g.valor], ["frete_gratis", 0]);
});
Deno.test("cupom pessoal desligado ou cliente sem id da loja = para todos", () => {
  assertEquals(buildBirthdaySpec({ ...base, personal_coupon: false }, { ...o, liCustomerId: 1 }).clientes, undefined);
  assertEquals(buildBirthdaySpec(base, { ...o, liCustomerId: null }).clientes, undefined);
});
Deno.test("textos: variaveis novas e formato antigo", () => {
  const v = birthdayVars({ ...base, coupon_type: "fixo", coupon_fixed_value: 25, min_order_value: 100 });
  assertEquals(fillBirthday("{{desconto_texto}} / {desconto} / {{pedido_minimo}}", v), "R$ 25,00 / 25,00 / R$ 100,00");
  assertEquals(birthdayVars(base).desconto_texto, "10%");
});
