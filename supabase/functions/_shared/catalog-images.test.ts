import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MAX_CATALOG_PHOTOS, pickCatalogImages } from "./catalog-images.ts";

const A = "https://cdn.awsli.com.br/777/777259/produto/1/a.png";
const B = "https://cdn.awsli.com.br/777/777259/produto/1/b.png";
const C = "https://cdn.awsli.com.br/777/777259/produto/1/c.png";
const D = "https://cdn.awsli.com.br/777/777259/produto/1/d.png";

Deno.test("pickCatalogImages: usa image_urls na ordem escolhida", () => {
  assertEquals(pickCatalogImages({ image_urls: [B, A, C] }), [B, A, C]);
});
Deno.test("pickCatalogImages: limita a 3 fotos", () => {
  assertEquals(MAX_CATALOG_PHOTOS, 3);
  assertEquals(pickCatalogImages({ image_urls: [A, B, C, D] }), [A, B, C]);
});
Deno.test("pickCatalogImages: sem image_urls cai na image_url antiga (compatibilidade)", () => {
  assertEquals(pickCatalogImages({ image_url: A }), [A]);
  assertEquals(pickCatalogImages({ image_url: A, image_urls: [] }), [A]);
});
Deno.test("pickCatalogImages: tira repetidas, vazias, não-texto e endereços que não são https", () => {
  assertEquals(pickCatalogImages({ image_urls: [A, A, "", "  ", null, 5, "http://x.com/a.png", "javascript:alert(1)", B] }), [A, B]);
});
Deno.test("pickCatalogImages: amplia a versão reduzida da CDN da loja para o original", () => {
  assertEquals(pickCatalogImages({ image_urls: ["https://cdn.awsli.com.br/800x800/777/777259/produto/1/a.png"] }), [A]);
});
Deno.test("pickCatalogImages: sem foto nenhuma devolve lista vazia", () => {
  assertEquals(pickCatalogImages({}), []);
  assertEquals(pickCatalogImages({ image_url: null, image_urls: undefined }), []);
});
