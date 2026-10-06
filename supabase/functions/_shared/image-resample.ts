import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

/**
 * Redimensionamento de alta qualidade (Lanczos3, separável). O `resize` do ImageScript só tem vizinho-mais-próximo,
 * que serrilha a imagem. Aqui o retângulo de origem (sx, sy, sw, sh) vira uma imagem dw x dh; transparência é achatada sobre branco.
 */
const A = 3; // Lanczos3

const lanczos = (x: number): number => {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= A) return 0;
  const px = Math.PI * x;
  return (A * Math.sin(px) * Math.sin(px / A)) / (px * px);
};

/** Para cada pixel de destino: primeiro pixel de origem, quantidade e pesos normalizados (bordas repetidas). */
function buildWeights(srcStart: number, srcLen: number, dstLen: number) {
  const ratio = srcLen / dstLen;
  const scale = Math.max(1, ratio); // ao reduzir, o filtro se alarga (evita serrilhado)
  const support = A * scale;
  const taps = Math.ceil(support * 2) + 2;
  const first = new Int32Array(dstLen);
  const w = new Float32Array(dstLen * taps);
  for (let i = 0; i < dstLen; i++) {
    const center = srcStart + (i + 0.5) * ratio;
    const left = Math.floor(center - support);
    first[i] = left;
    let sum = 0;
    for (let t = 0; t < taps; t++) {
      const v = lanczos((left + t + 0.5 - center) / scale);
      w[i * taps + t] = v;
      sum += v;
    }
    if (sum !== 0) for (let t = 0; t < taps; t++) w[i * taps + t] /= sum;
  }
  return { first, w, taps };
}

export function resampleLanczos(src: Image, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): Image {
  const bmp = src.bitmap; // RGBA
  const sxEnd = sx + sw - 1, syEnd = sy + sh - 1;
  const hx = buildWeights(sx, sw, dw);
  const vy = buildWeights(sy, sh, dh);

  // passo horizontal: sh linhas x dw colunas, 3 canais (alfa achatado sobre branco)
  const tmp = new Float32Array(dw * sh * 3);
  for (let y = 0; y < sh; y++) {
    const rowBase = (sy + y) * src.width;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0;
      const left = hx.first[x];
      for (let t = 0; t < hx.taps; t++) {
        const px = Math.min(sxEnd, Math.max(sx, left + t));
        const wt = hx.w[x * hx.taps + t];
        const o = (rowBase + px) * 4;
        const a = bmp[o + 3] / 255;
        r += wt * (bmp[o] * a + 255 * (1 - a));
        g += wt * (bmp[o + 1] * a + 255 * (1 - a));
        b += wt * (bmp[o + 2] * a + 255 * (1 - a));
      }
      const o2 = (y * dw + x) * 3;
      tmp[o2] = r; tmp[o2 + 1] = g; tmp[o2 + 2] = b;
    }
  }

  // passo vertical
  const out = new Image(dw, dh);
  const ob = out.bitmap;
  for (let y = 0; y < dh; y++) {
    const top = vy.first[y];
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0;
      for (let t = 0; t < vy.taps; t++) {
        const py = Math.min(syEnd, Math.max(sy, top + t)) - sy;
        const wt = vy.w[y * vy.taps + t];
        const o = (py * dw + x) * 3;
        r += wt * tmp[o]; g += wt * tmp[o + 1]; b += wt * tmp[o + 2];
      }
      const o2 = (y * dw + x) * 4;
      ob[o2] = r; ob[o2 + 1] = g; ob[o2 + 2] = b; ob[o2 + 3] = 255; // Uint8ClampedArray limita 0..255
    }
  }
  return out;
}
