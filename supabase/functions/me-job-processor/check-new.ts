import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { ME_API_URL, ME_USER_AGENT, buildShipmentData } from "./me-helpers.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export async function checkNewShipments(
  supabase: Supabase, integrationId: string, tenantId: string, accessToken: string, log: Log
): Promise<{ newShipments: number }> {
  let newShipments = 0;
  let page = 1;
  const limit = 100;
  let hasMore = true;

  while (hasMore && page <= 5) {
    const url = `${ME_API_URL}/me/orders?limit=${limit}&page=${page}`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT }
    });

    if (!response.ok) { log.error(`[me-job-processor] API error: ${response.status}`); break; }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) { log.warn(`[me-job-processor] Non-JSON response, stopping`); break; }

    const data = await response.json();
    const orders = data.data || data || [];
    if (!Array.isArray(orders) || orders.length === 0) { hasMore = false; break; }

    for (const order of orders) {
      let externalOrderNumber = null;
      if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
        externalOrderNumber = order.tags[0]?.tag || null;
      }
      const shipmentData = {
        ...buildShipmentData(order, tenantId, integrationId),
        external_order_number: externalOrderNumber,
        order_number: order.order_number || order.invoice?.key || null,
        posted_at: order.posted_at || null, delivered_at: order.delivered_at || null,
        paid_at: order.paid_at || null, generated_at: order.generated_at || null,
        delivery_min: order.delivery_min || null, delivery_max: order.delivery_max || null,
        invoice: order.invoice || null, volumes: order.volumes || null,
        tags: order.tags || null, products: order.products || null,
        last_sync_at: new Date().toISOString()
      };
      const { error } = await supabase.from("me_shipments").upsert(shipmentData, { onConflict: "tenant_id,me_id" });
      if (!error) newShipments++;
    }

    hasMore = orders.length >= limit;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }

  log.info(`[me-job-processor] Found ${newShipments} new shipments`);
  return { newShipments };
}
