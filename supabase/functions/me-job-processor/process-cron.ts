import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { readMelhorEnvioTokens } from "../_shared/credential-helpers.ts";
import { createLogger } from "../_shared/correlation.ts";
import { ME_API_URL, ME_USER_AGENT, mapStatus, buildShipmentData, reconcileLojaIntegradaStatus } from "./me-helpers.ts";

type Supabase = ReturnType<typeof createClient>;
type Log = ReturnType<typeof createLogger>;

export async function processCron(
  supabase: Supabase, log: Log
): Promise<{ processed: number; totalNew: number; totalUpdated: number; totalReconciled: number }> {
  const { data: activeConfigs } = await supabase
    .from("me_auto_sync_configs")
    .select("*, integrations!inner(tenant_id, status)")
    .eq("is_active", true)
    .in("integrations.status", ["connected", "active"])
    .lte("next_sync_at", new Date().toISOString());

  let integrationsToProccess: Array<{ integration_id: string; tenant_id: string; config_id?: string; interval_minutes: number }> = [];

  if (activeConfigs && activeConfigs.length > 0) {
    integrationsToProccess = activeConfigs.map(c => ({
      integration_id: c.integration_id,
      tenant_id: (c.integrations as Record<string, unknown>).tenant_id,
      config_id: c.id,
      interval_minutes: c.interval_minutes || 30
    }));
  } else {
    const { data: meIntegrations } = await supabase
      .from("integrations").select("id, tenant_id")
      .eq("type", "melhor_envio").in("status", ["connected", "active"]);

    if (meIntegrations && meIntegrations.length > 0) {
      for (const integ of meIntegrations) {
        const { data: existingConfig } = await supabase
          .from("me_auto_sync_configs").select("id, is_active, next_sync_at")
          .eq("integration_id", integ.id).eq("sync_type", "shipments").maybeSingle();

        if (!existingConfig) {
          const { data: newConfig } = await supabase
            .from("me_auto_sync_configs")
            .insert({ integration_id: integ.id, tenant_id: integ.tenant_id, sync_type: "shipments", is_active: true, interval_minutes: 30, next_sync_at: new Date().toISOString() })
            .select("id").single();
          integrationsToProccess.push({ integration_id: integ.id, tenant_id: integ.tenant_id, config_id: newConfig?.id, interval_minutes: 30 });
          log.info(`[me-job-processor] Auto-created config for integration ${integ.id}`);
        }
      }
    }
  }

  if (integrationsToProccess.length === 0) {
    log.info("[me-job-processor] No integrations due for sync");
    return { processed: 0, totalNew: 0, totalUpdated: 0, totalReconciled: 0 };
  }

  log.info(`[me-job-processor] Processing ${integrationsToProccess.length} integrations`);
  let processed = 0, totalNew = 0, totalUpdated = 0, totalReconciled = 0;

  for (const item of integrationsToProccess) {
    try {
      const { data: tokenRecord } = await supabase
        .from("melhor_envio_tokens").select("access_token_encrypted, expires_at").eq("tenant_id", item.tenant_id).single();
      if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
        log.info(`[me-job-processor] Token expired/missing for tenant ${item.tenant_id}`); continue;
      }
      const meTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
      const accessToken = meTokens?.accessToken;
      if (!accessToken) { log.info(`[me-job-processor] Could not decrypt token for tenant ${item.tenant_id}, skipping`); continue; }

      // Check new shipments
      let newShipments = 0;
      try {
        let page = 1; const limit = 100; let hasMore = true;
        while (hasMore && page <= 5) {
          const url = `${ME_API_URL}/me/orders?limit=${limit}&page=${page}`;
          const response = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT } });
          if (!response.ok) { log.error(`[me-job-processor] API error page ${page}: ${response.status}`); break; }
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) { log.warn(`[me-job-processor] Non-JSON response on page ${page}, stopping`); break; }
          const data = await response.json();
          const orders = data.data || data || [];
          if (!Array.isArray(orders) || orders.length === 0) { hasMore = false; break; }
          for (const order of orders) {
            let externalOrderNumber = null;
            if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) externalOrderNumber = order.tags[0]?.tag || null;
            const shipmentData = { ...buildShipmentData(order, item.tenant_id, item.integration_id), external_order_number: externalOrderNumber, order_number: order.order_number || order.invoice?.key || null, posted_at: order.posted_at || null, delivered_at: order.delivered_at || null, paid_at: order.paid_at || null, generated_at: order.generated_at || null, delivery_min: order.delivery_min || null, delivery_max: order.delivery_max || null, invoice: order.invoice || null, volumes: order.volumes || null, tags: order.tags || null, products: order.products || null, last_sync_at: new Date().toISOString() };
            const { data: upserted, error: upsertError } = await supabase.from("me_shipments").upsert(shipmentData, { onConflict: "tenant_id,me_id" }).select("id").single();
            if (!upsertError && upserted) newShipments++;
          }
          hasMore = orders.length >= limit;
          page++;
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) { log.error(`[me-job-processor] Error checking new for ${item.integration_id}:`, err); }
      totalNew += newShipments;

      // Update tracking
      let updated = 0;
      try {
        const { data: activeShipments } = await supabase
          .from("me_shipments").select("id, me_id, tracking_code, status, li_order_id, external_order_number, order_number, tenant_id")
          .eq("integration_id", item.integration_id).not("status", "in", '("delivered","canceled","expired","returned")')
          .order("updated_at", { ascending: true }).limit(50);

        if (activeShipments && activeShipments.length > 0) {
          for (const shipment of activeShipments) {
            try {
              const response = await fetch(`${ME_API_URL}/me/orders/${shipment.me_id}`, { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT } });
              if (!response.ok) { if (response.status === 429) { log.info(`[me-job-processor] Rate limited, stopping tracking updates`); break; } continue; }
              const contentType = response.headers.get("content-type") || "";
              if (!contentType.includes("application/json")) { log.warn(`[me-job-processor] Non-JSON response for ${shipment.me_id}, skipping`); continue; }
              const orderData = await response.json();
              const newStatus = mapStatus(orderData.status);
              const updateData: Record<string, unknown> = { status: newStatus, tracking_code: orderData.tracking || shipment.tracking_code, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() };
              if (orderData.tracking) {
                const trackingResponse = await fetch(`${ME_API_URL}/me/shipment/tracking?orders=${shipment.me_id}`, { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json", "User-Agent": ME_USER_AGENT } });
                const trackingCt = trackingResponse.headers.get("content-type") || "";
                if (trackingResponse.ok && trackingCt.includes("application/json")) {
                  const trackingData = await trackingResponse.json();
                  const events = trackingData[shipment.me_id]?.events || [];
                  if (events.length > 0) { updateData.tracking_events = events; updateData.last_tracking_at = new Date().toISOString(); }
                }
              }
              if (newStatus === "delivered" && shipment.status !== "delivered") updateData.delivered_at = orderData.delivered_date || new Date().toISOString();
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
              await new Promise(r => setTimeout(r, 300));
            } catch (err) { log.error(`[me-job-processor] Error updating ${shipment.me_id}:`, err); }
          }
        }
      } catch (err) { log.error(`[me-job-processor] Error updating tracking for ${item.integration_id}:`, err); }
      totalUpdated += updated;

      const reconciled = await reconcileLojaIntegradaStatus(supabase, item.integration_id, item.tenant_id, 40, log);
      totalReconciled += reconciled;

      if (item.config_id) {
        const nextSync = new Date();
        nextSync.setMinutes(nextSync.getMinutes() + item.interval_minutes);
        await supabase.from("me_auto_sync_configs").update({ last_sync_at: new Date().toISOString(), next_sync_at: nextSync.toISOString() }).eq("id", item.config_id);
      }
      await supabase.from("integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", item.integration_id);
      processed++;
    } catch (err) { log.error(`[me-job-processor] Error processing integration ${item.integration_id}:`, err); }
  }

  log.info(`[me-job-processor] Processed ${processed} integrations, ${totalNew} new, ${totalUpdated} updated, ${totalReconciled} reconciled`);
  return { processed, totalNew, totalUpdated, totalReconciled };
}
