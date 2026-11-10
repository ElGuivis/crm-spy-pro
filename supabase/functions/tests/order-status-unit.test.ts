import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSaleStatus } from "../_shared/order-status.ts";

Deno.test("vendas: todo status de andamento conta", () => {
  for (const s of ["Pedido Pago", "Pedido em separação", "Pedido Enviado", "Pedido Entregue", "Pedido em preparação"]) assertEquals(isSaleStatus(s), true, s);
});
Deno.test("nao venda: cancelado, devolvido, chargeback, aguardando", () => {
  for (const s of ["Pedido Cancelado", "Pagamento devolvido", "Pagamento devolvido - sem retorno de item", "Pagamento em chargeback", "Aguardando pagamento", "Pedido Efetuado", null, ""]) assertEquals(isSaleStatus(s), false, String(s));
});
