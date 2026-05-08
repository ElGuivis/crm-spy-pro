import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { readMelhorEnvioTokens } from "../_shared/credential-helpers.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MELHOR_ENVIO_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "sandbox";

const ME_BASE_URL = MELHOR_ENVIO_ENVIRONMENT === "production" 
  ? "https://www.melhorenvio.com.br" 
  : "https://sandbox.melhorenvio.com.br";
const ME_API_URL = `${ME_BASE_URL}/api/v2`;

log.info(`[me-job-processor] Inicializado - Ambiente: ${MELHOR_ENVIO_ENVIRONMENT}`);

// Map ME status to internal status
function mapStatus(meStatus: string): string {
  const statusMap: Record<string, string> = {
    "draft": "pending",
    "pending": "pending",
    "released": "pending",
    "generated": "pending",
    "printed": "posted",
    "posted": "posted",
    "delivered": "delivered",
    "canceled": "canceled",
    "undelivered": "in_transit",
    "returning": "returning",
    "returned": "returned",
    "expired": "expired"
  };
  return statusMap[meStatus] || meStatus || "pending";
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("me-job-processor", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const auth = await requireUserOrInternalAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "process";
    const integrationId = body.integrationId;

    log.info(`[me-job-processor] Action: ${action}, IntegrationId: ${integrationId || 'all'}, isInternal=${auth.isInternal}`);

    // IDOR protection: validate integration belongs to user's tenant on user calls
    if (!auth.isInternal && auth.tenantId && integrationId) {
      await requireResource(supabase, "integrations", integrationId, auth.tenantId, req);
    }

    switch (action) {
      // ==================== CHECK NEW SHIPMENTS ====================
      case "check-new": {
        if (!integrationId) {
          return new Response(
            JSON.stringify({ success: false, error: "integrationId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get integration and token
        const { data: integration } = await supabase
          .from("integrations")
          .select("tenant_id")
          .eq("id", integrationId)
          .single();

        if (!integration) {
          return new Response(
            JSON.stringify({ success: false, error: "Integração não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
          .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", integration.tenant_id)
          .single();

        if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ success: false, error: "Token expirado ou inexistente" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Resolve encrypted access token
        const meTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
        const resolvedAccessToken = meTokens?.accessToken;
        if (!resolvedAccessToken) {
          return new Response(
            JSON.stringify({ success: false, error: "Token não pode ser descriptografado" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get most recent shipment date for this integration
        const { data: lastShipment } = await supabase
          .from("me_shipments")
          .select("created_at")
          .eq("integration_id", integrationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastDate = lastShipment?.created_at 
          ? new Date(lastShipment.created_at).toISOString()
          : null;

        log.info(`[me-job-processor] Last shipment date: ${lastDate}`);

        // Fetch recent orders from API
        let newShipments = 0;
        let page = 1;
        const limit = 100;
        let hasMore = true;

        while (hasMore && page <= 5) {
          const url = `${ME_API_URL}/me/orders?limit=${limit}&page=${page}`;
          
          const response = await fetch(url, {
            headers: {
              "Authorization": `Bearer ${resolvedAccessToken}`,
              "Accept": "application/json",
              "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
            }
          });

          if (!response.ok) {
            log.error(`[me-job-processor] API error: ${response.status}`);
            break;
          }

          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            log.warn(`[me-job-processor] Non-JSON response, stopping`);
            break;
          }

          const data = await response.json();
          const orders = data.data || data || [];

          if (!Array.isArray(orders) || orders.length === 0) {
            hasMore = false;
            break;
          }

          for (const order of orders) {
            const meId = String(order.id);
            
            let externalOrderNumber = null;
            if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
              externalOrderNumber = order.tags[0]?.tag || null;
            }

            const shipmentData = {
              ...buildShipmentData(order, integration.tenant_id, integrationId),
              external_order_number: externalOrderNumber,
              order_number: order.order_number || order.invoice?.key || null,
              posted_at: order.posted_at || null,
              delivered_at: order.delivered_at || null,
              paid_at: order.paid_at || null,
              generated_at: order.generated_at || null,
              delivery_min: order.delivery_min || null,
              delivery_max: order.delivery_max || null,
              invoice: order.invoice || null,
              volumes: order.volumes || null,
              tags: order.tags || null,
              products: order.products || null,
              last_sync_at: new Date().toISOString()
            };

            const { error: upsertError } = await supabase
              .from("me_shipments")
              .upsert(shipmentData, { onConflict: "tenant_id,me_id" });

            if (!upsertError) {
              newShipments++;
            }
          }

          if (orders.length < limit) {
            hasMore = false;
          } else {
            page++;
            await new Promise(r => setTimeout(r, 300));
          }
        }

        log.info(`[me-job-processor] Found ${newShipments} new shipments`);

        return new Response(
          JSON.stringify({ success: true, newShipments }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== UPDATE TRACKING ====================
      case "update-tracking": {
        if (!integrationId) {
          return new Response(
            JSON.stringify({ success: false, error: "integrationId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: integration } = await supabase
          .from("integrations")
          .select("tenant_id")
          .eq("id", integrationId)
          .single();

        if (!integration) {
          return new Response(
            JSON.stringify({ success: false, error: "Integração não encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
          .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", integration.tenant_id)
          .single();

        if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ success: false, error: "Token expirado" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get active shipments (not delivered, not canceled, not expired)
        const { data: activeShipments } = await supabase
          .from("me_shipments")
          .select("id, me_id, tracking_code, status, li_order_id, external_order_number, order_number, tenant_id")
          .eq("integration_id", integrationId)
          .not("status", "in", '("delivered","canceled","expired","returned")')
          .order("updated_at", { ascending: true })
          .limit(100);

        const shipmentsToUpdate = activeShipments || [];
        if (shipmentsToUpdate.length === 0) {
          log.info("[me-job-processor] Nenhum envio ativo para update-tracking, executando reconciliação de status terminal");
        }

        let updated = 0;

        for (const shipment of shipmentsToUpdate) {
          try {
            // Fetch order details from API
            const response = await fetch(`${ME_API_URL}/me/orders/${shipment.me_id}`, {
              headers: {
                "Authorization": `Bearer ${resolvedAccessToken}`,
                "Accept": "application/json",
                "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
              }
            });

            if (!response.ok) continue;

            const orderData = await response.json();
            const newStatus = mapStatus(orderData.status);

            // Build update data
            const updateData: Record<string, unknown> = {
              status: newStatus,
              tracking_code: orderData.tracking || shipment.tracking_code,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            // Update tracking events if has tracking
            if (orderData.tracking) {
              const trackingResponse = await fetch(
                `${ME_API_URL}/me/shipment/tracking?orders=${shipment.me_id}`,
                {
                  headers: {
                    "Authorization": `Bearer ${resolvedAccessToken}`,
                    "Accept": "application/json",
                    "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                  }
                }
              );

              if (trackingResponse.ok) {
                const trackingData = await trackingResponse.json();
                const events = trackingData[shipment.me_id]?.events || [];
                if (events.length > 0) {
                  updateData.tracking_events = events;
                  updateData.last_tracking_at = new Date().toISOString();
                }
              }
            }

            // Update dates based on status
            if (newStatus === "delivered" && !shipment.status?.includes("delivered")) {
              updateData.delivered_at = new Date().toISOString();
            }
            if (newStatus === "posted" && orderData.posted_date) {
              updateData.posted_at = orderData.posted_date;
            }

            await supabase
              .from("me_shipments")
              .update(updateData)
              .eq("id", shipment.id);

            // Propagate status to Loja Integrada if changed to posted/delivered
            if ((newStatus === "delivered" || newStatus === "posted") && newStatus !== shipment.status) {
              const meStatus = newStatus === "delivered" ? "delivered" : "posted";
              const orderNum = shipment.external_order_number || shipment.order_number;
              try {
                const syncResult = await syncStatusToLojaIntegrada(
                  supabase,
                  shipment.tenant_id,
                  meStatus,
                  shipment.li_order_id,
                  orderNum
                );
                if (syncResult.success) {
                  log.info(`[me-job-processor] Status "${meStatus}" propagado para LI pedido ${syncResult.order_number}`);
                }
              } catch (syncErr) {
                log.error(`[me-job-processor] Erro ao propagar status para LI:`, syncErr);
              }
            }

            updated++;
            await new Promise(r => setTimeout(r, 150));
          } catch (err) {
            log.error(`[me-job-processor] Error updating ${shipment.me_id}:`, err);
          }
        }

        const reconciled = await reconcileLojaIntegradaStatus(supabase, integrationId, integration.tenant_id, 60);

        log.info(`[me-job-processor] Updated ${updated} shipments, reconciled ${reconciled} statuses`);

        return new Response(
          JSON.stringify({ success: true, updated, reconciled }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== CRON PROCESS (check all active integrations) ====================
      case "process":
      default: {
        // First try auto-sync configs
        const { data: activeConfigs } = await supabase
          .from("me_auto_sync_configs")
          .select("*, integrations!inner(tenant_id, status)")
          .eq("is_active", true)
          .in("integrations.status", ["connected", "active"])
          .lte("next_sync_at", new Date().toISOString());

        // Fallback: if no configs, find all active ME integrations directly
        let integrationsToProccess: Array<{ integration_id: string; tenant_id: string; config_id?: string; interval_minutes: number }> = [];

        if (activeConfigs && activeConfigs.length > 0) {
          integrationsToProccess = activeConfigs.map(c => ({
            integration_id: c.integration_id,
            tenant_id: (c.integrations as Record<string, unknown>).tenant_id,
            config_id: c.id,
            interval_minutes: c.interval_minutes || 30
          }));
        } else {
          // Fallback: get all ME integrations without a config or with stale configs
          const { data: meIntegrations } = await supabase
            .from("integrations")
            .select("id, tenant_id")
            .eq("type", "melhor_envio")
            .in("status", ["connected", "active"]);

          if (meIntegrations && meIntegrations.length > 0) {
            for (const integ of meIntegrations) {
              // Check if has a config already
              const { data: existingConfig } = await supabase
                .from("me_auto_sync_configs")
                .select("id, is_active, next_sync_at")
                .eq("integration_id", integ.id)
                .eq("sync_type", "shipments")
                .maybeSingle();

              if (!existingConfig) {
                // Auto-create config
                const { data: newConfig } = await supabase
                  .from("me_auto_sync_configs")
                  .insert({
                    integration_id: integ.id,
                    tenant_id: integ.tenant_id,
                    sync_type: "shipments",
                    is_active: true,
                    interval_minutes: 30,
                    next_sync_at: new Date().toISOString()
                  })
                  .select("id")
                  .single();

                integrationsToProccess.push({
                  integration_id: integ.id,
                  tenant_id: integ.tenant_id,
                  config_id: newConfig?.id,
                  interval_minutes: 30
                });
                log.info(`[me-job-processor] Auto-created config for integration ${integ.id}`);
              }
            }
          }
        }

        if (integrationsToProccess.length === 0) {
          log.info("[me-job-processor] No integrations due for sync");
          return new Response(
            JSON.stringify({ success: true, processed: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        log.info(`[me-job-processor] Processing ${integrationsToProccess.length} integrations`);

        let processed = 0;
        let totalNew = 0;
        let totalUpdated = 0;
        let totalReconciled = 0;

        for (const item of integrationsToProccess) {
          try {
            // Get token for tenant
            const { data: tokenRecord } = await supabase
              .from("melhor_envio_tokens")
              .select("access_token_encrypted, expires_at")
              .eq("tenant_id", item.tenant_id)
              .single();

            if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
              log.info(`[me-job-processor] Token expired/missing for tenant ${item.tenant_id}`);
              continue;
            }

            const meTokensDecrypted = await readMelhorEnvioTokens(supabase, tokenRecord);
            const resolvedAccessToken = meTokensDecrypted?.accessToken;
            if (!resolvedAccessToken) {
              log.info(`[me-job-processor] Could not decrypt token for tenant ${item.tenant_id}, skipping`);
              continue;
            }

            // --- Check new shipments inline (avoid recursive fetch) ---
            let newShipments = 0;
            try {
              let page = 1;
              const limit = 100;
              let hasMore = true;
              let foundExistingStreak = 0;

              while (hasMore && page <= 5) {
                const url = `${ME_API_URL}/me/orders?limit=${limit}&page=${page}`;
                const response = await fetch(url, {
                  headers: {
                    "Authorization": `Bearer ${resolvedAccessToken}`,
                    "Accept": "application/json",
                    "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                  }
                });

                if (!response.ok) {
                  log.error(`[me-job-processor] API error page ${page}: ${response.status}`);
                  break;
                }

                const contentType = response.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                  log.warn(`[me-job-processor] Non-JSON response on page ${page}, stopping`);
                  break;
                }

                const data = await response.json();
                const orders = data.data || data || [];
                if (!Array.isArray(orders) || orders.length === 0) { hasMore = false; break; }

                for (const order of orders) {
                  const meId = String(order.id);
                  const toAddress = order.to || {};
                  
                  // Extract external_order_number from tags
                  let externalOrderNumber = null;
                  if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
                    externalOrderNumber = order.tags[0]?.tag || null;
                  }

                  const shipmentData = {
                    ...buildShipmentData(order, item.tenant_id, item.integration_id),
                    external_order_number: externalOrderNumber,
                    order_number: order.order_number || order.invoice?.key || null,
                    posted_at: order.posted_at || null,
                    delivered_at: order.delivered_at || null,
                    paid_at: order.paid_at || null,
                    generated_at: order.generated_at || null,
                    delivery_min: order.delivery_min || null,
                    delivery_max: order.delivery_max || null,
                    invoice: order.invoice || null,
                    volumes: order.volumes || null,
                    tags: order.tags || null,
                    products: order.products || null,
                    last_sync_at: new Date().toISOString()
                  };

                  const { data: upserted, error: upsertError } = await supabase
                    .from("me_shipments")
                    .upsert(shipmentData, { onConflict: "tenant_id,me_id" })
                    .select("id")
                    .single();

                  if (!upsertError && upserted) {
                    newShipments++;
                  }
                }

                // Stop early if we've processed all pages
                hasMore = orders.length >= limit;
                page++;
                await new Promise(r => setTimeout(r, 300));
              }
            } catch (err) {
              log.error(`[me-job-processor] Error checking new for ${item.integration_id}:`, err);
            }

            totalNew += newShipments;

            // --- Update tracking for active shipments inline ---
            let updated = 0;
            try {
              const { data: activeShipments } = await supabase
                .from("me_shipments")
                .select("id, me_id, tracking_code, status, li_order_id, external_order_number, order_number, tenant_id")
                .eq("integration_id", item.integration_id)
                .not("status", "in", '("delivered","canceled","expired","returned")')
                .order("updated_at", { ascending: true })
                .limit(50);

              if (activeShipments && activeShipments.length > 0) {
                for (const shipment of activeShipments) {
                  try {
                    const response = await fetch(`${ME_API_URL}/me/orders/${shipment.me_id}`, {
                      headers: {
                        "Authorization": `Bearer ${resolvedAccessToken}`,
                        "Accept": "application/json",
                        "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                      }
                    });

                    if (!response.ok) {
                      if (response.status === 429) {
                        log.info(`[me-job-processor] Rate limited, stopping tracking updates`);
                        break;
                      }
                      continue;
                    }

                    const contentType = response.headers.get("content-type") || "";
                    if (!contentType.includes("application/json")) {
                      log.warn(`[me-job-processor] Non-JSON response for ${shipment.me_id}, skipping`);
                      continue;
                    }

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
                        {
                          headers: {
                            "Authorization": `Bearer ${resolvedAccessToken}`,
                            "Accept": "application/json",
                            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                          }
                        }
                      );

                      const trackingCt = trackingResponse.headers.get("content-type") || "";
                      if (trackingResponse.ok && trackingCt.includes("application/json")) {
                        const trackingData = await trackingResponse.json();
                        const events = trackingData[shipment.me_id]?.events || [];
                        if (events.length > 0) {
                          updateData.tracking_events = events;
                          updateData.last_tracking_at = new Date().toISOString();
                        }
                      }
                    }

                    if (newStatus === "delivered" && shipment.status !== "delivered") {
                      updateData.delivered_at = orderData.delivered_date || new Date().toISOString();
                    }
                    if (newStatus === "posted" && orderData.posted_date) {
                      updateData.posted_at = orderData.posted_date;
                    }

                    await supabase.from("me_shipments").update(updateData).eq("id", shipment.id);

                    // Propagate status to Loja Integrada if changed to posted/delivered
                    if ((newStatus === "delivered" || newStatus === "posted") && newStatus !== shipment.status) {
                      const meStatus = newStatus === "delivered" ? "delivered" : "posted";
                      const orderNum = shipment.external_order_number || shipment.order_number;
                      try {
                        const syncResult = await syncStatusToLojaIntegrada(
                          supabase,
                          shipment.tenant_id,
                          meStatus,
                          shipment.li_order_id,
                          orderNum
                        );
                        if (syncResult.success) {
                          log.info(`[me-job-processor] Status "${meStatus}" propagado para LI pedido ${syncResult.order_number}`);
                        }
                      } catch (syncErr) {
                        log.error(`[me-job-processor] Erro ao propagar status para LI:`, syncErr);
                      }
                    }

                    updated++;
                    await new Promise(r => setTimeout(r, 300));
                  } catch (err) {
                    log.error(`[me-job-processor] Error updating ${shipment.me_id}:`, err);
                  }
                }
              }
            } catch (err) {
              log.error(`[me-job-processor] Error updating tracking for ${item.integration_id}:`, err);
            }

            totalUpdated += updated;

            const reconciled = await reconcileLojaIntegradaStatus(
              supabase,
              item.integration_id,
              item.tenant_id,
              40
            );
            totalReconciled += reconciled;

            // Update next sync time
            if (item.config_id) {
              const nextSync = new Date();
              nextSync.setMinutes(nextSync.getMinutes() + item.interval_minutes);

              await supabase
                .from("me_auto_sync_configs")
                .update({
                  last_sync_at: new Date().toISOString(),
                  next_sync_at: nextSync.toISOString()
                })
                .eq("id", item.config_id);
            }

            // Update integration last_sync_at
            await supabase
              .from("integrations")
              .update({ last_sync_at: new Date().toISOString() })
              .eq("id", item.integration_id);

            processed++;
          } catch (err) {
            log.error(`[me-job-processor] Error processing integration ${item.integration_id}:`, err);
          }
        }

        log.info(`[me-job-processor] Processed ${processed} integrations, ${totalNew} new, ${totalUpdated} updated, ${totalReconciled} reconciled`);

        return new Response(
          JSON.stringify({ success: true, processed, totalNew, totalUpdated, totalReconciled }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
  } catch (error: unknown) {
    log.error("[me-job-processor] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function reconcileLojaIntegradaStatus(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
  tenantId: string,
  limit = 40
): Promise<number> {
  try {
    const { data: terminalShipments } = await supabase
      .from("me_shipments")
      .select("status, li_order_id, external_order_number, order_number")
      .eq("integration_id", integrationId)
      .eq("tenant_id", tenantId)
      .in("status", ["posted", "delivered"])
      .not("li_order_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!terminalShipments || terminalShipments.length === 0) return 0;

    const liOrderIds = [...new Set(terminalShipments.map((s: Record<string, unknown>) => s.li_order_id).filter(Boolean))] as string[];
    if (liOrderIds.length === 0) return 0;

    const { data: liOrders } = await supabase
      .from("li_orders")
      .select("id, status_name")
      .in("id", liOrderIds);

    const liStatusById = new Map((liOrders || []).map((o: Record<string, unknown>) => [o.id, o.status_name || null]));

    let reconciled = 0;

    for (const shipment of terminalShipments) {
      const expected = shipment.status === "delivered" ? "Pedido Entregue" : "Pedido Enviado";
      const current = liStatusById.get(shipment.li_order_id) || null;

      if (current === expected) continue;

      const orderNum = shipment.external_order_number || shipment.order_number;
      const result = await syncStatusToLojaIntegrada(
        supabase,
        tenantId,
        shipment.status,
        shipment.li_order_id,
        orderNum
      );

      if (result.success) {
        reconciled++;
        liStatusById.set(shipment.li_order_id, expected);
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    return reconciled;
  } catch (err) {
    log.error("[me-job-processor] Error reconciling LI statuses:", err);
    return 0;
  }
}

// Helper function to build shipment data
function buildShipmentData(order: Record<string, unknown>, tenantId: string, integrationId: string) {
  const toAddress = order.to || {};
  
  return {
    tenant_id: tenantId,
    integration_id: integrationId,
    me_id: String(order.id),
    order_id: null,
    order_number: order.order_number || null,
    protocol: order.protocol || null,
    tracking_code: order.tracking || null,
    service_name: order.service?.name || null,
    carrier: order.service?.company?.name || null,
    status: mapStatus(order.status),
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
    sender_name: order.from?.name || null,
    raw_data: order,
    synced_at: new Date().toISOString(),
    created_at: order.created_at || new Date().toISOString()
  };
}
