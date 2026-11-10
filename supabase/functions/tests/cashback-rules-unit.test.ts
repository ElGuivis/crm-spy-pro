import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCashbackSpec, cashbackBase, creditFor, extraTemplateVars, isReversedStatus, minOrderFor } from "../_shared/cashback-rules.ts";
import { buildLiCouponPayload } from "../_shared/li-coupons.ts";

const cfg = { discount_percentage: 10, max_cart_percent: 30, min_order_mode: "multiple", min_order_value: 10, personal_coupon: true, cumulative: true };

Deno.test("base: produtos menos desconto, sem frete (pedido 9922 real)", () => {
  assertEquals(cashbackBase({ total: 71.38, subtotal: 54.9, discount: 3.84, shipping: 20.32 }, true), 51.06);
  assertEquals(cashbackBase({ total: 71.38, subtotal: 54.9, discount: 3.84, shipping: 20.32 }, false), 71.38);
});
Deno.test("base: sem subtotal usa total - frete", () => {
  assertEquals(cashbackBase({ total: 100, shipping: 20 }, true), 80);
});
Deno.test("crédito: 10% de R$ 899,90 = R$ 89,99 e respeita teto e mínimo", () => {
  assertEquals(creditFor(899.9, cfg), 89.99);
  assertEquals(creditFor(899.9, { ...cfg, max_discount_value: 50 }), 50);
  assertEquals(creditFor(100, { ...cfg, min_credit_value: 20 }), 0);
  assertEquals(creditFor(300, { ...cfg, min_credit_value: 20 }), 30);
});
Deno.test("pedido mínimo: sem, fixo e múltiplo do crédito", () => {
  assertEquals(minOrderFor(89.9, { ...cfg, min_order_mode: "none" }), null);
  assertEquals(minOrderFor(89.9, { ...cfg, min_order_mode: "fixed", min_order_value: 250 }), 250);
  assertEquals(minOrderFor(89.9, cfg), 899);
});
Deno.test("cupom: percentual com teto no crédito, pessoal e cumulativo", () => {
  const spec = buildCashbackSpec(cfg, 89.9, { validade: "2026-12-25", descricao: "Cashback", liCustomerId: "62665317" });
  assertEquals([spec.tipo, spec.valor, spec.limiteDesconto, spec.valorMinimo, spec.cumulativo, spec.clientes], ["porcentagem", 30, 89.9, 899, true, [62665317]]);
  const p = buildLiCouponPayload({ ...spec, codigo: "abc12" });
  assertEquals([p.tipo, p.valor, p.limite_desconto, p.valor_minimo, p.condicao_cliente, p.clientes], ["porcentagem", "30.00", "89.90", "899.00", "clientes_selecionados", ["62665317"]]);
});
Deno.test("cupom: sem percentual máximo continua valor fixo (modo antigo) e sem cliente vira todos", () => {
  const spec = buildCashbackSpec({ ...cfg, max_cart_percent: null, min_order_mode: "none", personal_coupon: false }, 40, { validade: "2026-12-25", descricao: "x", liCustomerId: "1" });
  const p = buildLiCouponPayload({ ...spec, codigo: "abc12" });
  assertEquals([p.tipo, p.valor, p.limite_desconto, p.valor_minimo, p.condicao_cliente], ["fixo", "40.00", undefined, undefined, "todos_clientes"]);
});
Deno.test("textos e status revertidos", () => {
  assertEquals(extraTemplateVars(cfg, 89.9), { percentual_max: "30%", pedido_minimo: "R$ 899,00" });
  for (const s of ["Pedido Cancelado", "Pagamento devolvido", "Pagamento em chargeback", "Pagamento devolvido - sem retorno de item"]) assertEquals(isReversedStatus(s), true);
  for (const s of ["Pedido Pago", "Pedido Enviado", "Pedido Entregue", null]) assertEquals(isReversedStatus(s), false);
});
