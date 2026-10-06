import { supabase } from "@/integrations/supabase/client";
import { MAX_CATALOG_PHOTOS, type CatalogProduct } from "./catalogoHelpers";

type Body = Record<string, unknown>;
export type Item = { id: string; name?: string; image_urls?: string[] };
type Outcome = { id: string; status: "sent" | "failed" | "skipped" };

export interface CatalogSendResult<T extends Item = Item> {
  sent: number;
  /** produtos que continuam sem enviar (falhou depois de todas as tentativas ou o envio foi interrompido) */
  failed: number;
  images_sent: number;
  token_cost: number;
  pending: T[];
  stopped: boolean;
}

export interface SendCatalogControl {
  /** consultado entre uma chamada e outra: a chamada em andamento sempre termina (não dá para desfazer um envio no meio) */
  shouldStop?: () => boolean;
  onProgress?: (sent: number, total: number) => void;
}

const ATTEMPTS = 3;
const RETRY_WAIT_MS = [0, 3000, 8000];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Produto do catálogo no formato que a função whatsapp-send-catalog recebe. */
export function toCatalogPayload(p: CatalogProduct) {
  return {
    id: p.id, name: p.name, price: p.price, stock: p.stock,
    image_url: p.imageUrl, image_urls: (p.sendImages?.length ? p.sendImages : p.images.slice(0, 1)).slice(0, MAX_CATALOG_PHOTOS),
    variations: p.variations, source: p.source,
  };
}

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

/**
 * Envia o catálogo em chamadas sequenciais. O que não saiu é reenviado sozinho (até 3 rodadas); o que continuar
 * pendente volta em `pending` para o usuário reenviar com um clique. Produto enviado nunca é reenviado.
 */
export async function sendCatalogInChunks<T extends Item>(
  base: Body, products: T[], collage: boolean, control: SendCatalogControl = {},
): Promise<CatalogSendResult<T>> {
  const total = { sent: 0, images_sent: 0, token_cost: 0 };
  let pending = products;
  let lastError: unknown = null;
  let stopped = false;
  for (let attempt = 0; attempt < ATTEMPTS && pending.length && !stopped; attempt++) {
    if (RETRY_WAIT_MS[attempt]) await wait(RETRY_WAIT_MS[attempt]);
    const sentIds = new Set<string>();
    for (const chunk of chunkCatalogProducts(pending, collage)) {
      if (control.shouldStop?.()) { stopped = true; break; }
      const { data, error } = await supabase.functions.invoke("whatsapp-send-catalog", { body: { ...base, products: chunk } });
      if (error || !data) { lastError = error ?? new Error("Sem resposta do servidor"); continue; }
      const r = data as { sent?: number; failed?: number; skipped?: number; images_sent?: number; token_cost?: number; results?: Outcome[] };
      total.sent += r.sent ?? 0; total.images_sent += r.images_sent ?? 0; total.token_cost += r.token_cost ?? 0;
      if (r.results) for (const o of r.results) { if (o.status === "sent") sentIds.add(String(o.id)); }
      else if (!r.failed && !r.skipped) for (const p of chunk) sentIds.add(String(p.id)); // servidor antigo, sem resultado por produto
      control.onProgress?.(total.sent, products.length);
    }
    pending = pending.filter((p) => !sentIds.has(String(p.id)));
    if (control.shouldStop?.()) stopped = true;
  }
  if (total.sent === 0 && pending.length && lastError && !stopped) throw lastError;
  return { ...total, failed: pending.length, pending, stopped };
}
