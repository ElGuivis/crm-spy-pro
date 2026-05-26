import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { createLogger } from "../_shared/correlation.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export const MELHOR_ENVIO_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "sandbox";
export const ME_BASE_URL = MELHOR_ENVIO_ENVIRONMENT === "production"
  ? "https://www.melhorenvio.com.br"
  : "https://sandbox.melhorenvio.com.br";
export const ME_API_URL = `${ME_BASE_URL}/api/v2`;
export const ME_USER_AGENT = "CRM SpyPro (suporte@spypro.com.br)";

export function mapStatus(meStatus: string): string {
  const statusMap: Record<string, string> = {
    "draft": "pending", "pending": "pending", "released": "pending", "generated": "pending",
    "printed": "posted", "posted": "posted", "delivered": "delivered", "canceled": "canceled",
    "undelivered": "in_transit", "returning": "returning", "returned": "returned", "expired": "expired"
  };
  return statusMap[meStatus] || meStatus || "pending";
}

export function buildShipmentData(order: Record<string, unknown>, tenantId: string, integrationId: string) {
  const toAddress = (order.to || {}) as Record<string, unknown>;
  return {
    tenant_id: tenantId,
    integration_id: integrationId,
    me_id: String(order.id),
    order_id: null,
    order_number: order.order_number || null,
    protocol: order.protocol || null,
    tracking_code: order.tracking || null,
    service_name: (order.service as Record<string, unknown>)?.name || null,
    carrier: ((order.service as Record<string, unknown>)?.company as Record<string, unknown>)?.name || null,
    status: mapStatus(order.status as string),
    price: order.price || null,
    discount: order.discount || null,
    insurance_value: order.insurance_value || null,
    format: order.format || null,
    weight: order.weight || null,
    width: order.width || null,
    height: order.height || null,
    length: order.length || null,
    to_address: toAddress,
    from_address: order.from || null,
    receiver_name: toAddress.name || null,
    receiver_phone: toAddress.phone || null,
    receiver_city: toAddress.city || null,
    receiver_state: toAddress.state_abbr || null,
    sender_name: (order.from as Record<string, unknown>)?.name || null,
    raw_data: order,
    synced_at: new Date().toISOString(),
    created_at: order.created_at || new Date().toISOString()
  };
}

export async function reconcileLojaIntegradaStatus(
  supabase: Supabase, integrationId: string, tenantId: string, limit: number, log: Log
): Promise<number> {
  try {
    const { data: terminalShipments } = await supabase
      .from("me_shipments")
      .select("status, li_order_id, external_order_number, order_number")
      .eq("integration_id", integrationId).eq("tenant_id", tenantId)
      .in("status", ["posted", "delivered"]).not("li_order_id", "is", null)
      .order("updated_at", { ascending: false }).limit(limit);

    if (!terminalShipments || terminalShipments.length === 0) return 0;

    const liOrderIds = [...new Set(terminalShipments.map((s: Record<string, unknown>) => s.li_order_id).filter(Boolean))] as string[];
    if (liOrderIds.length === 0) return 0;

    const { data: liOrders } = await supabase.from("li_orders").select("id, status_name").in("id", liOrderIds);
    const liStatusById = new Map((liOrders || []).map((o: Record<string, unknown>) => [o.id, o.status_name || null]));

    let reconciled = 0;
    for (const shipment of terminalShipments) {
      const expected = shipment.status === "delivered" ? "Pedido Entregue" : "Pedido Enviado";
      const current = liStatusById.get(shipment.li_order_id) || null;
      if (current === expected) continue;
      const orderNum = shipment.external_order_number || shipment.order_number;
      const result = await syncStatusToLojaIntegrada(supabase, tenantId, shipment.status, shipment.li_order_id, orderNum);
      if (result.success) { reconciled++; liStatusById.set(shipment.li_order_id, expected); }
      await new Promise((r) => setTimeout(r, 120));
    }
    return reconciled;
  } catch (err) {
    log.error("[me-job-processor] Error reconciling LI statuses:", err);
    return 0;
  }
}
