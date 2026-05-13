/**
 * Nuvemshop products sync — paginated, resumable.
 * Endpoint: GET /products?page=N&per_page=200
 *
 * Products in Nuvemshop have variants. We flatten the first variant's
 * price/stock/sku to top-level columns and store the full variants array in
 * variations_json.
 */

import {
  ServiceClient,
  nuvemshopApiBase,
  nuvemshopFetch,
  hasNextPage,
  getOrCreateNuvemshopSyncState,
  updateNuvemshopSyncState,
  NUVEMSHOP_PAGE_SIZE,
} from "./nuvemshop-helpers.ts";
import { createLogger } from "./correlation.ts";

const log = createLogger("nuvemshop-sync-products", "shared");

interface NuvemshopVariant {
  id: number;
  product_id: number;
  sku?: string | null;
  price?: string | null;
  promotional_price?: string | null;
  cost?: string | null;
  stock_management?: boolean;
  stock?: number | null;
}

interface NuvemshopProduct {
  id: number;
  name?: Record<string, string> | string;
  description?: Record<string, string> | string;
  handle?: Record<string, string> | string;
  published?: boolean;
  images?: Array<{ src?: string }>;
  variants?: NuvemshopVariant[];
  updated_at?: string;
  created_at?: string;
}

function pickLang(value: Record<string, string> | string | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.pt || value["pt-br"] || value.en || value.es || Object.values(value)[0] || null;
}

export async function syncNuvemshopProducts(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  storeId: number,
  accessToken: string,
  deadline: number,
): Promise<number> {
  const state = await getOrCreateNuvemshopSyncState(supabase, integrationId, tenantId, "products");
  let synced = 0;
  let page = (state?.last_page || 0) + 1;
  let keepGoing = true;

  log.info(`[nuvemshop-sync] Products: resuming from page=${page}`);

  while (keepGoing && Date.now() < deadline) {
    const url = `${nuvemshopApiBase(storeId)}/products?page=${page}&per_page=${NUVEMSHOP_PAGE_SIZE}`;
    const res = await nuvemshopFetch(url, accessToken);
    if (!res.ok) {
      log.error(`[nuvemshop-sync] Products fetch failed status=${res.status} page=${page}`);
      break;
    }
    const products: NuvemshopProduct[] = await res.json();
    if (!products.length) {
      keepGoing = false;
      if (state?.id) await updateNuvemshopSyncState(supabase, state.id, { last_page: 0 });
      break;
    }

    const rows = products.map((p) => {
      const v0 = p.variants && p.variants[0] ? p.variants[0] : null;
      const totalStock = (p.variants || []).reduce((acc, v) => acc + (v.stock || 0), 0);
      return {
        integration_id: integrationId,
        tenant_id: tenantId,
        nuvemshop_product_id: p.id,
        sku: v0?.sku || null,
        name: pickLang(p.name) || "Sem nome",
        handle: pickLang(p.handle),
        description: pickLang(p.description),
        price: v0?.price ? parseFloat(v0.price) : null,
        promotional_price: v0?.promotional_price ? parseFloat(v0.promotional_price) : null,
        cost_price: v0?.cost ? parseFloat(v0.cost) : null,
        stock: v0?.stock_management ? totalStock : null,
        stock_managed: !!v0?.stock_management,
        active: p.published !== false,
        variations_json: p.variants || null,
        image_url: p.images && p.images[0] ? (p.images[0].src || null) : null,
        raw_json: p as unknown as Record<string, unknown>,
        updated_at_remote: p.updated_at || null,
        updated_at_local: new Date().toISOString(),
      };
    });

    const { error: upErr } = await supabase.from("nuvemshop_products").upsert(rows, {
      onConflict: "integration_id,nuvemshop_product_id",
    });
    if (upErr) {
      log.error(`[nuvemshop-sync] Products upsert error page=${page}: ${upErr.message}`);
      break;
    }
    synced += rows.length;

    if (state?.id) {
      await updateNuvemshopSyncState(supabase, state.id, {
        last_page: page,
        records_synced: (state.records_synced || 0) + synced,
      });
    }

    keepGoing = hasNextPage(res);
    page += 1;
  }

  if (!keepGoing && state?.id) {
    await updateNuvemshopSyncState(supabase, state.id, {
      last_page: 0,
      last_synced_at: new Date().toISOString(),
    });
  }

  log.info(`[nuvemshop-sync] Products batch done: ${synced} (more=${keepGoing})`);
  return synced;
}
