/**
 * Nuvemshop orders sync — paginated, resumable.
 * Endpoint: GET /orders?page=N&per_page=200
 *
 * Each order brings nested `customer` and `products[]` arrays — we resolve the
 * local customer FK by upserting first, then build items snapshot + items rows.
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

const log = createLogger("nuvemshop-sync-orders", "shared");

interface NuvemshopOrderProduct {
  id: number;
  product_id: number;
  variant_id?: number;
  name?: string;
  sku?: string | null;
  quantity?: number;
  price?: string;
  image?: { src?: string } | null;
}

interface NuvemshopOrder {
  id: number;
  number: number | string;
  status?: string;
  payment_status?: string;
  shipping_status?: string;
  customer?: { id?: number; name?: string; email?: string; phone?: string };
  products?: NuvemshopOrderProduct[];
  shipping?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  shipping_cost_customer?: string;
  shipping_tracking_number?: string | null;
  shipping_tracking_url?: string | null;
  payment_details?: Record<string, unknown>;
  payment_method?: string;
  gateway?: string;
  gateway_name?: string;
  subtotal?: string;
  total?: string;
  discount?: string;
  created_at?: string;
  updated_at?: string;
}

async function resolveCustomerFk(
  supabase: ServiceClient,
  integrationId: string,
  nuvemshopCustomerId: number | undefined,
): Promise<string | null> {
  if (!nuvemshopCustomerId) return null;
  const { data } = await supabase.from("nuvemshop_customers")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("nuvemshop_customer_id", nuvemshopCustomerId)
    .maybeSingle();
  return data?.id || null;
}

export async function upsertNuvemshopOrder(
  supabase: ServiceClient,
  order: NuvemshopOrder,
  integrationId: string,
  tenantId: string,
): Promise<void> {
  const customerId = await resolveCustomerFk(supabase, integrationId, order.customer?.id);

  const itemsJson = (order.products || []).map((it) => ({
    product_id: it.product_id,
    variant_id: it.variant_id || null,
    sku: it.sku || null,
    name: it.name || "Item",
    qty: it.quantity || 1,
    price: it.price ? parseFloat(it.price) : 0,
    image_url: it.image?.src || null,
  }));

  const totalsJson = {
    subtotal: order.subtotal ? parseFloat(order.subtotal) : 0,
    total: order.total ? parseFloat(order.total) : 0,
    shipping: order.shipping_cost_customer ? parseFloat(order.shipping_cost_customer) : 0,
    discount: order.discount ? parseFloat(order.discount) : 0,
  };

  const shippingJson = {
    method: typeof order.shipping === "object" ? order.shipping : null,
    address: order.shipping_address || null,
    tracking_code: order.shipping_tracking_number || null,
    tracking_url: order.shipping_tracking_url || null,
  };

  const paymentJson = {
    method: order.payment_method || null,
    gateway: order.gateway || null,
    gateway_name: order.gateway_name || null,
    details: order.payment_details || null,
  };

  const { data: orderRow, error: upErr } = await supabase.from("nuvemshop_orders").upsert({
    integration_id: integrationId,
    tenant_id: tenantId,
    nuvemshop_order_id: order.id,
    order_number: String(order.number),
    status: order.status || null,
    payment_status: order.payment_status || null,
    shipping_status: order.shipping_status || null,
    customer_id: customerId,
    totals_json: totalsJson,
    shipping_json: shippingJson,
    payment_json: paymentJson,
    items_json: itemsJson,
    raw_json: order as unknown as Record<string, unknown>,
    created_at_remote: order.created_at || null,
    updated_at_remote: order.updated_at || null,
    updated_at_local: new Date().toISOString(),
  }, { onConflict: "integration_id,nuvemshop_order_id" }).select("id").single();

  if (upErr) {
    log.error(`[nuvemshop-sync] Order ${order.number} upsert error: ${upErr.message}`);
    return;
  }

  if (orderRow?.id && itemsJson.length > 0) {
    await supabase.from("nuvemshop_order_items").delete().eq("order_id", orderRow.id);
    await supabase.from("nuvemshop_order_items").insert(itemsJson.map((it) => ({
      order_id: orderRow.id,
      tenant_id: tenantId,
      nuvemshop_product_id: it.product_id,
      nuvemshop_variant_id: it.variant_id,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      price: it.price,
      raw_json: it as unknown as Record<string, unknown>,
    })));
  }
}

export async function syncNuvemshopOrders(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  storeId: number,
  accessToken: string,
  deadline: number,
): Promise<number> {
  const state = await getOrCreateNuvemshopSyncState(supabase, integrationId, tenantId, "orders");
  let synced = 0;
  let page = (state?.last_page || 0) + 1;
  let keepGoing = true;

  log.info(`[nuvemshop-sync] Orders: resuming from page=${page}`);

  while (keepGoing && Date.now() < deadline) {
    const url = `${nuvemshopApiBase(storeId)}/orders?page=${page}&per_page=${NUVEMSHOP_PAGE_SIZE}`;
    const res = await nuvemshopFetch(url, accessToken);
    if (!res.ok) {
      log.error(`[nuvemshop-sync] Orders fetch failed status=${res.status} page=${page}`);
      break;
    }
    const orders: NuvemshopOrder[] = await res.json();
    if (!orders.length) {
      keepGoing = false;
      if (state?.id) await updateNuvemshopSyncState(supabase, state.id, { last_page: 0 });
      break;
    }

    for (const order of orders) {
      if (Date.now() >= deadline) {
        keepGoing = true;
        break;
      }
      try {
        await upsertNuvemshopOrder(supabase, order, integrationId, tenantId);
        synced++;
      } catch (e) {
        log.error(`[nuvemshop-sync] Order ${order.id} error:`, (e as Error).message);
      }
    }

    if (state?.id) {
      await updateNuvemshopSyncState(supabase, state.id, {
        last_page: page,
        records_synced: (state.records_synced || 0) + synced,
      });
    }

    keepGoing = keepGoing && hasNextPage(res);
    page += 1;
  }

  if (!keepGoing && state?.id) {
    await updateNuvemshopSyncState(supabase, state.id, {
      last_page: 0,
      last_synced_at: new Date().toISOString(),
    });
  }

  log.info(`[nuvemshop-sync] Orders batch done: ${synced} (more=${keepGoing})`);
  return synced;
}
