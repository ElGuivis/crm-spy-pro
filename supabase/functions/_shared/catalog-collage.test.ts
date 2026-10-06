import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { composeCollage } from "./catalog-collage.ts";
import { resampleLanczos } from "./image-resample.ts";

const photo = (w: number, h: number, color: number) => new Image(w, h).fill(color);
const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
const rgb = (img: Image, x: number, y: number) => { const [r, g, b] = img.getRGBAAt(x + 1, y + 1); return [r, g, b]; };

Deno.test("composeCollage: 3 fotos em pé (682x1024) viram 1027x1024: a 1ª no tamanho original, sem ampliar", () => {
  const c = composeCollage([photo(682, 1024, 0xff0000ff), photo(682, 1024, 0x00ff00ff), photo(1000, 1000, 0x0000ffff)]);
  assertEquals([c.width, c.height], [1027, 1024]);
  assertEquals(rgb(c, 100, 100), [255, 0, 0]);     // grande à esquerda = foto 1
  assertEquals(rgb(c, 900, 100), [0, 255, 0]);     // superior direita = foto 2
  assertEquals(rgb(c, 900, 800), [0, 0, 255]);     // inferior direita = foto 3
});

Deno.test("composeCollage: 2 fotos ficam lado a lado, cada uma do tamanho da 1ª (1370x1024)", () => {
  const c = composeCollage([photo(682, 1024, 0xff0000ff), photo(500, 900, 0x00ff00ff)]);
  assertEquals([c.width, c.height], [1370, 1024]);
  assertEquals(rgb(c, 100, 100), [255, 0, 0]);
  assertEquals(rgb(c, 1200, 100), [0, 255, 0]);
});

Deno.test("composeCollage: foto de referência maior que 1200 px só é reduzida, nunca ampliada", () => {
  const c = composeCollage([photo(2400, 1600, 0xff0000ff), photo(2400, 1600, 0x00ff00ff)]);
  assertEquals([c.width, c.height], [1200 * 2 + 6, 800]);
  const small = composeCollage([photo(400, 300, 0xff0000ff), photo(400, 300, 0x00ff00ff)]);
  assertEquals([small.width, small.height], [806, 300]); // 400x300 não foi esticada
});

Deno.test("composeCollage: so aceita 2 ou 3 fotos", () => {
  assertThrows(() => composeCollage([photo(10, 10, 0xff)]));
  assertThrows(() => composeCollage([photo(10, 10, 0xff), photo(10, 10, 0xff), photo(10, 10, 0xff), photo(10, 10, 0xff)]));
});

Deno.test("composeCollage: o resultado codifica em JPEG de qualidade alta", async () => {
  const c = composeCollage([photo(682, 1024, 0xff0000ff), photo(682, 1024, 0x00ff00ff)]);
  const jpg = await c.encodeJPEG(95);
  assertEquals([jpg[0], jpg[1]], [0xff, 0xd8]);
});

Deno.test("resampleLanczos: cor lisa continua exatamente a mesma ao reduzir e ao ampliar", () => {
  const solid = photo(200, 300, 0x3366ccff);
  for (const [w, h] of [[100, 150], [400, 600], [37, 91]]) {
    const out = resampleLanczos(solid, 0, 0, 200, 300, w, h);
    assertEquals([out.width, out.height], [w, h]);
    assert(near(rgb(out, w >> 1, h >> 1)[0], 0x33) && near(rgb(out, w >> 1, h >> 1)[1], 0x66) && near(rgb(out, w >> 1, h >> 1)[2], 0xcc));
    assert(near(rgb(out, 0, 0)[2], 0xcc) && near(rgb(out, w - 1, h - 1)[2], 0xcc)); // bordas também (pixels repetidos)
  }
});

Deno.test("resampleLanczos: listras finas viram cinza médio ao reduzir (sem serrilhado) e mantém o preto e branco grandes", () => {
  const stripes = new Image(200, 200).fill(0xffffffff);
  for (let x = 0; x < 200; x += 2) for (let y = 0; y < 200; y++) stripes.setPixelAt(x + 1, y + 1, 0x000000ff);
  const half = resampleLanczos(stripes, 0, 0, 200, 200, 100, 100);
  const mid = rgb(half, 50, 50)[0];
  assert(mid > 100 && mid < 160, `esperava cinza médio, veio ${mid}`);
  const blocks = new Image(200, 200).fill(0xffffffff);
  for (let x = 0; x < 100; x++) for (let y = 0; y < 200; y++) blocks.setPixelAt(x + 1, y + 1, 0x000000ff);
  const small = resampleLanczos(blocks, 0, 0, 200, 200, 100, 100);
  assert(rgb(small, 10, 50)[0] < 5 && rgb(small, 90, 50)[0] > 250);
});

Deno.test("resampleLanczos: usa só o retângulo de origem pedido (recorte)", () => {
  const img = new Image(100, 100).fill(0xff0000ff);
  for (let x = 50; x < 100; x++) for (let y = 0; y < 100; y++) img.setPixelAt(x + 1, y + 1, 0x00ff00ff);
  const right = resampleLanczos(img, 50, 0, 50, 100, 25, 50);
  assertEquals(rgb(right, 12, 25), [0, 255, 0]);
});

Deno.test("resampleLanczos: transparência é achatada sobre branco", () => {
  const img = new Image(20, 20).fill(0x00000000); // totalmente transparente
  assertEquals(rgb(resampleLanczos(img, 0, 0, 20, 20, 10, 10), 5, 5), [255, 255, 255]);
});
