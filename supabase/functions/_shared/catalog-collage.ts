import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { resampleLanczos } from "./image-resample.ts";

/**
 * Colagem das fotos de um produto numa única imagem (a Evolution API 2.3 não manda álbum do WhatsApp: uma mídia por mensagem).
 * Prioridade: NÃO perder definição. A 1ª foto entra no tamanho original (sem ampliar nem recortar); as demais só são reduzidas,
 * com Lanczos, e só recortadas o mínimo para caber na célula.
 *  - 2 fotos: lado a lado, cada uma do tamanho da 1ª.
 *  - 3 fotos: a 1ª grande à esquerda e as outras duas empilhadas à direita (metade da altura), como o álbum do WhatsApp.
 */
export const COLLAGE_MAX_SOURCE_PIXELS = 12_000_000; // acima disso não decodifica (limite de memória da função)
export const COLLAGE_MAX_SOURCE_BYTES = 8_000_000;
export const COLLAGE_JPEG_QUALITY = 95;
const GAP = 6;
const MAX_SIDE = 1200; // lado maior da foto de referência (nunca amplia)

/** Preenche a célula w x h com a foto, recortando o mínimo (um pouco acima do centro, onde costuma estar a peça). */
function fillCell(img: Image, w: number, h: number): Image {
  const cellAspect = w / h, imgAspect = img.width / img.height;
  let sw = img.width, sh = img.height;
  if (imgAspect > cellAspect) sw = Math.round(img.height * cellAspect); // foto mais larga que a célula: corta dos lados
  else sh = Math.round(img.width / cellAspect); // mais alta: corta em cima/embaixo
  const sx = Math.floor((img.width - sw) / 2);
  const sy = Math.max(0, Math.min(img.height - sh, Math.floor((img.height - sh) * 0.35)));
  if (sw === w && sh === h) return img.width === w && img.height === h ? img : resampleLanczos(img, sx, sy, sw, sh, w, h);
  return resampleLanczos(img, sx, sy, sw, sh, w, h);
}

/** Monta a colagem de 2 ou 3 imagens já decodificadas. */
export function composeCollage(imgs: Image[]): Image {
  if (imgs.length !== 2 && imgs.length !== 3) throw new Error(`colagem precisa de 2 ou 3 fotos, recebeu ${imgs.length}`);
  const ref = imgs[0];
  const k = Math.min(1, MAX_SIDE / Math.max(ref.width, ref.height)); // só reduz, nunca amplia
  const rw = Math.round(ref.width * k), rh = Math.round(ref.height * k);

  if (imgs.length === 2) {
    const canvas = new Image(rw * 2 + GAP, rh).fill(0xffffffff);
    canvas.composite(fillCell(imgs[0], rw, rh), 0, 0);
    canvas.composite(fillCell(imgs[1], rw, rh), rw + GAP, 0);
    return canvas;
  }
  const ch = Math.floor((rh - GAP) / 2);
  const cw = Math.round(ch * (rw / rh)); // mesma proporção da foto grande
  const canvas = new Image(rw + GAP + cw, rh).fill(0xffffffff);
  canvas.composite(fillCell(imgs[0], rw, rh), 0, 0);
  canvas.composite(fillCell(imgs[1], cw, ch), rw + GAP, 0);
  canvas.composite(fillCell(imgs[2], cw, ch), rw + GAP, ch + GAP);
  return canvas;
}

async function load(url: string): Promise<Image> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`foto indisponível (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > COLLAGE_MAX_SOURCE_BYTES) throw new Error("foto grande demais para a colagem");
  const img = await Image.decode(bytes);
  if (img.width * img.height > COLLAGE_MAX_SOURCE_PIXELS) throw new Error("foto com resolução alta demais para a colagem");
  return img;
}

/** Baixa as fotos e devolve a colagem em JPEG (base64, pronto para o sendMedia). Lança erro se qualquer foto falhar. */
export async function buildCollageBase64(urls: string[]): Promise<string> {
  const imgs = await Promise.all(urls.map(load));
  const jpeg = await composeCollage(imgs).encodeJPEG(COLLAGE_JPEG_QUALITY);
  return encodeBase64(jpeg);
}
