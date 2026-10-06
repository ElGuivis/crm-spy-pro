import { supabase } from "@/integrations/supabase/client";

export interface CatalogSendResult {
  sent: number;
  failed: number;
  skipped: number;
  images_sent: number;
  token_cost: number;
}

type Body = Record<string, unknown>;
type Item = { image_urls?: string[] };

/**
 * A colagem é montada no servidor e gasta CPU; a função aguenta ~1 colagem por chamada antes do limite do runtime (erro 546).
 * Então cada produto com colagem vai numa chamada própria e os de foto única são agrupados.
 */
export function chunkCatalogProducts<T extends Item>(products: T[], collage: boolean): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [], weight = 0;
  for (const p of products) {
    const w = collage && (p.image_urls?.length ?? 0) > 1 ? 2 : 0.5;
    if (cur.length && weight + w > 2) { chunks.push(cur); cur = []; weight = 0; }
    cur.push(p); weight += w;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Envia o catálogo em chamadas sequenciais e soma o resultado; uma chamada que falha conta seus produtos como falhos. */
export async function sendCatalogInChunks(
  base: Body, products: Item[], collage: boolean,
): Promise<CatalogSendResult> {
  const total: CatalogSendResult = { sent: 0, failed: 0, skipped: 0, images_sent: 0, token_cost: 0 };
  let lastError: unknown = null;
  for (const chunk of chunkCatalogProducts(products, collage)) {
    const { data, error } = await supabase.functions.invoke("whatsapp-send-catalog", { body: { ...base, products: chunk } });
    if (error || !data) { total.failed += chunk.length; lastError = error ?? new Error("Sem resposta do servidor"); continue; }
    const r = data as Partial<CatalogSendResult>;
    total.sent += r.sent ?? 0; total.failed += r.failed ?? 0; total.skipped += r.skipped ?? 0;
    total.images_sent += r.images_sent ?? 0; total.token_cost += r.token_cost ?? 0;
  }
  if (total.sent === 0 && lastError) throw lastError;
  return total;
}
