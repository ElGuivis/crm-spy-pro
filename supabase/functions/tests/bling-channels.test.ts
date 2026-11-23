import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { orderInChannels, orderListQueries, parseChannelScope, productListParams } from "../_shared/bling-channels.ts";

const o = (id?: number) => (id === undefined ? {} : { loja: { id } });

Deno.test("sem escolha = todos os pedidos", () => {
  assertEquals(orderInChannels(o(205386947), null), true);
  assertEquals(orderListQueries(null), [{}]);
});
Deno.test("só os canais escolhidos; o Bling filtra por idLoja", () => {
  const ids = [205485988, 206351427];
  assertEquals(orderInChannels(o(205485988), ids), true);
  assertEquals(orderInChannels(o(205386947), ids), false);
  assertEquals(orderInChannels(o(0), ids), false);
  assertEquals(orderListQueries(ids), [{ idLoja: "205485988" }, { idLoja: "206351427" }]);
});
Deno.test("sem canal (0) entra e a lista vem inteira, filtrada aqui", () => {
  const ids = [205485988, 0];
  assertEquals(orderInChannels(o(0), ids), true);
  assertEquals(orderInChannels(o(), ids), true);
  assertEquals(orderInChannels(o(205386947), ids), false);
  assertEquals(orderListQueries(ids), [{}]);
});
Deno.test("leitura da integração", () => {
  assertEquals(parseChannelScope({ bling_store_ids: [], bling_product_store_id: null }), { orderStoreIds: null, productStoreId: null });
  assertEquals(parseChannelScope({ bling_store_ids: [5, 5, 0], bling_product_store_id: "206351427" }), { orderStoreIds: [5, 0], productStoreId: 206351427 });
  assertEquals(productListParams(null), {});
  assertEquals(productListParams(7), { idLoja: "7" });
});
