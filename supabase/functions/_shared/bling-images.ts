/**
 * Fotos dos produtos do Bling copiadas para o nosso Storage (22/11/2026).
 *
 * O Bling entrega: na LISTAGEM só uma miniatura (~2 KB, link assinado que vence em < 1 h); no
 * DETALHE, `midia.imagens.internas[].link` = foto original (~1,6 MB) com link assinado que vence em
 * 7 dias, e `externas[].link` (URLs de fora). Guardar o link do Bling = foto quebrada em 7 dias.
 *
 * Aqui cada foto é baixada pelo imgproxy do próprio stack (redimensiona para no máximo 2000 px,
 * JPEG qualidade 90: visualmente igual ao original, ~4x menor) e gravada no bucket público
 * `product-images` em `<tenant>/bling/<chave>.jpg`. A chave é o id da foto no S3 do Bling (a mesma
 * foto do pai e das variações vira UM arquivo) ou um hash da URL externa. Foto já copiada não é
 * baixada de novo. A grade usa a versão reduzida do Storage (`/render/image`), o detalhe e o
 * WhatsApp usam a grande.
 */

export const PRODUCT_IMAGES_BUCKET = "product-images";
const IMGPROXY = Deno.env.get("IMGPROXY_INTERNAL_URL") ?? "http://imgproxy:5001";
const MAX_SIDE = 2000;
const QUALITY = 90;

export interface BlingImage {
  /** URL pública no nosso Storage */
  link: string;
  /** id estável da foto (S3 do Bling ou hash da URL externa) */
  key: string;
  ordem: number;
}

interface SourceImage { url: string; key: string; ordem: number }

type Storage = {
  storage: {
    from: (b: string) => {
      upload: (path: string, body: Uint8Array, opts: { contentType: string; upsert: boolean; cacheControl?: string }) => PromiseLike<{ error: unknown }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

async function sha1(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** id da foto no S3 do Bling: último trecho do caminho (o mesmo no link e na miniatura). */
function blingKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)amazonaws\.com$/.test(u.hostname) && !/bling/.test(u.hostname)) return null;
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return /^[A-Za-z0-9_-]{8,80}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

/** Fotos do detalhe do produto, na ordem do Bling (internas, depois externas). */
export async function sourceImages(detail: Record<string, unknown>): Promise<SourceImage[]> {
  const imgs = ((detail?.midia as Record<string, unknown>)?.imagens ?? {}) as Record<string, unknown>;
  const list = [
    ...(Array.isArray(imgs.internas) ? imgs.internas : []),
    ...(Array.isArray(imgs.externas) ? imgs.externas : []),
  ] as Record<string, unknown>[];
  const out: SourceImage[] = [];
  const seen = new Set<string>();
  for (const img of list) {
    const url = typeof img.link === "string" ? img.link : "";
    if (!/^https?:\/\//.test(url)) continue;
    const key = blingKey(url) ?? `x${await sha1(url.split("?")[0])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, key, ordem: out.length });
  }
  return out;
}

async function exists(publicUrl: string): Promise<boolean> {
  try {
    const r = await fetch(publicUrl, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchResized(url: string): Promise<Uint8Array | null> {
  // rs:fit sem ampliar (último 0 = não aumenta foto pequena); saída JPEG
  const proxied = `${IMGPROXY}/insecure/rs:fit:${MAX_SIDE}:${MAX_SIDE}:0/q:${QUALITY}/plain/${encodeURIComponent(url)}@jpg`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      if (r.status < 500) return null; // foto inexistente/link vencido: não adianta repetir
    } catch { /* tenta de novo */ }
  }
  return null;
}

/**
 * Copia as fotos do detalhe do produto para o Storage e devolve a lista para `bling_products.imagens`.
 * `known` = chaves já copiadas nesta rodada (pai e variações repetem as mesmas fotos).
 */
export async function mirrorBlingImages(
  sb: unknown, tenantId: string, detail: Record<string, unknown>, known: Map<string, string> = new Map(),
): Promise<{ images: BlingImage[]; failed: number }> {
  const store = (sb as Storage).storage.from(PRODUCT_IMAGES_BUCKET);
  const images: BlingImage[] = [];
  let failed = 0;
  for (const src of await sourceImages(detail)) {
    const path = `${tenantId}/bling/${src.key}.jpg`;
    const publicUrl = known.get(src.key) ?? store.getPublicUrl(path).data.publicUrl;
    if (!known.has(src.key) && !(await exists(publicUrl))) {
      const bytes = await fetchResized(src.url);
      if (!bytes) { failed++; continue; }
      const { error } = await store.upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
      if (error) { failed++; continue; }
    }
    known.set(src.key, publicUrl);
    images.push({ link: publicUrl, key: src.key, ordem: images.length });
  }
  return { images, failed };
}
