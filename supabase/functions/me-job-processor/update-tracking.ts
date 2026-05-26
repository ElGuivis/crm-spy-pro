import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { createLogger } from "../_shared/correlation.ts";
import { ME_API_URL, ME_USER_AGENT, mapStatus, reconcileLojaIntegradaStatus } from "./me-helpers.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export async function updateTracking(
  supabase: Supabase, integrationId: string, tenantId: string, accessToken: string, log: Log
): Promise<{ updated: number; reconciled: number }> {
  const { data: activeShipments } = await supabase
    .from("me_shipments")
    .select("id, me_id, tracking_code, status, li_order_id, external_order_number, order_number, tenant_id")
    .eq("integration_id", integrationId)
    .not("status", "in", '("delivered","canceled","expired","returned")')
    .order("updated_at", { ascending: true }).limit(100);

  const shipmentsToUpdate = activeShipments || [];
  if (shipmentsToUpdate.length === 0) {
    log.info("[me-job-processor] Nenhum envio ativo para update-tracking, executando reconciliação de status terminal");
  }

  let updated = 0;

  for (const shipment of shipmentsToUpdate) {
    try {
      const response = await fetch(`${ME_API_URL}/me/orders/${shipment.me_id}`, {
        headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT }
      });
      if (!response.ok) continue;

      const orderData = await response.json();
      const newStatus = mapStatus(orderData.status);

      const updateData: Record<string, unknown> = {
        status: newStatus,
        tracking_code: orderData.tracking || shipment.tracking_code,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (orderData.tracking) {
        const trackingResponse = await fetch(
          `${ME_API_URL}/me/shipment/tracking?orders=${shipment.me_id}`,
          { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT } }
        );
        if (trackingResponse.ok) {
          const trackingData = await trackingResponse.json();
          const events = trackingData[shipment.me_id]?.events || [];
          if (events.length > 0) { updateData.tracking_events = events; updateData.last_tracking_at = new Date().toISOString(); }
        }
      }

      if (newStatus === "delivered" && !shipment.status?.includes("delivered")) updateData.delivered_at = new Date().toISOString();
      if (newStatus === "posted" && orderData.posted_date) updateData.posted_at = orderData.posted_date;

      await supabase.from("me_shipments").update(updateData).eq("id", shipment.id);

      if ((newStatus === "delivered" || newStatus === "posted") && newStatus !== shipment.status) {
        const meStatus = newStatus === "delivered" ? "delivered" : "posted";
        const orderNum = shipment.external_order_number || shipment.order_number;
        try {
          const syncResult = await syncStatusToLojaIntegrada(supabase, shipment.tenant_id, meStatus, shipment.li_order_id, orderNum);
          if (syncResult.success) log.info(`[me-job-processor] Status "${meStatus}" propagado para LI pedido ${syncResult.order_number}`);
        } catch (syncErr) { log.error(`[me-job-processor] Erro ao propagar status para LI:`, syncErr); }
      }

      updated++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) { log.error(`[me-job-processor] Error updating ${shipment.me_id}:`, err); }
  }

  const reconciled = await reconcileLojaIntegradaStatus(supabase, integrationId, tenantId, 60, log);
  log.info(`[me-job-processor] Updated ${updated} shipments, reconciled ${reconciled} statuses`);
  return { updated, reconciled };
}
