import { hdImageUrl } from "./product-images.ts";

/** Quantas fotos de um mesmo produto podem ir numa só remessa do catálogo. */
export const MAX_CATALOG_PHOTOS = 3;

/**
 * Fotos que serão enviadas de um produto: `image_urls` (na ordem escolhida) ou, se não vier, a `image_url` antiga.
 * Só https, no máximo 3, sem repetidas, cada uma na melhor qualidade (original da CDN).
 */
export function pickCatalogImages(product: { image_url?: string | null; image_urls?: unknown }): string[] {
  const raw: unknown[] = Array.isArray(product.image_urls) && product.image_urls.length ? product.image_urls : [product.image_url];
  const out: string[] = [];
  for (const u of raw) {
    if (typeof u !== "string") continue;
    const url = hdImageUrl(u.trim()) ?? u.trim();
    if (!/^https:\/\/[^\s]+$/i.test(url) || out.includes(url)) continue;
    out.push(url);
    if (out.length >= MAX_CATALOG_PHOTOS) break;
  }
  return out;
}
