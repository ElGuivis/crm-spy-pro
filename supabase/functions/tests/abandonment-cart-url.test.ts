import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cartUrl, type CartItem } from "../_shared/abandonment-render.ts";

const item = (product_id: number | null, quantity: number): CartItem => ({ product_id, quantity, name: null, price: null, image: null, url: null });

Deno.test("cartUrl: monta o link que recoloca os itens no carrinho da loja", () => {
  assertEquals(
    cartUrl("https://www.usechronic.com.br/", [item(404881691, 1), item(404999361, 2)]),
    "https://www.usechronic.com.br/carrinho/produto/adicionar?404881691=1&404999361=2&utm_source=crm&utm_medium=recuperacao&utm_campaign=carrinho-abandonado-crm",
  );
});

Deno.test("cartUrl: soma quantidades repetidas e ignora item sem id", () => {
  assertEquals(
    cartUrl("https://loja.com.br", [item(10, 1), item(10, 2), item(null, 5)]),
    "https://loja.com.br/carrinho/produto/adicionar?10=3&utm_source=crm&utm_medium=recuperacao&utm_campaign=carrinho-abandonado-crm",
  );
});

Deno.test("cartUrl: sem itens identificados cai na tela do carrinho", () => {
  assertEquals(cartUrl("https://loja.com.br/"), "https://loja.com.br/carrinho/index");
  assertEquals(cartUrl("https://loja.com.br", [item(null, 1)]), "https://loja.com.br/carrinho/index");
});
