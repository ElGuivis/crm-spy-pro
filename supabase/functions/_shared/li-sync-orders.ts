/**
 * Loja Integrada Order Sync Functions
 * Extracted from li-job-processor/index.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
import { processOrder } from "./li-sync-orders-process.ts";

const log = createLogger("li-sync-orders", "shared");
type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export { processOrder } from "./li-sync-orders-process.ts";
export { updateOrderStatuses } from "./li-sync-orders-status.ts";

export async function syncNewOrders(
  supabase: ServiceClient,
  authHeader: string,
  lastDataCriacao: string | null,
  lastLiId: number,
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; synced: number; errors: string[]; debug: Record<string, unknown> }> {
  const errors: string[] = [];
  let synced = 0;
  const debug: Record<string, unknown> = { lastDataCriacao, lastLiId, apiOrders: [], comparisonResults: [] };

  try {
    let lastNumeroQuery = supabase
      .from("li_orders")
      .select("order_number, loja_integrada_order_id, created_at_remote")
      .order("loja_integrada_order_id", { ascending: false })
      .limit(1);

    if (integrationId) lastNumeroQuery = lastNumeroQuery.eq("integration_id", integrationId);

    const { data: lastOrderData } = await lastNumeroQuery.maybeSingle();

    const dbLastLiId = lastOrderData?.loja_integrada_order_id ? Number(lastOrderData.loja_integrada_order_id) : 0;
    const effectiveLastLiId = Math.max(lastLiId, dbLastLiId);
    const lastNumero = lastOrderData?.order_number ? parseInt(lastOrderData.order_number) : 0;

    debug.lastNumeroInDb = lastNumero;
    debug.lastLiIdInDb = effectiveLastLiId;
    log.info(`[DEBUG] Last order in DB: #${lastNumero} (li_id: ${effectiveLastLiId})`);

    const timestamp = Date.now();

    const countResponse = await fetch(`${LI_API_BASE}/pedido?limit=1&_t=${timestamp}`, {
      headers: { "Authorization": authHeader, "Cache-Control": "no-cache" },
    });

    if (!countResponse.ok) throw new Error(`API error: ${countResponse.status}`);

    const countData = await countResponse.json();
    const totalApiOrders = countData.meta?.total_count || 0;
    debug.totalApiOrders = totalApiOrders;

    log.info(`[DEBUG] Total orders in API: ${totalApiOrders}, last numero in DB: ${lastNumero}`);

    // LI API rejects requests where offset + limit > ~10000
    const MAX_API_OFFSET_LIMIT = 9500;
    // A API da Loja Integrada (token pessoal) responde 400 para limit > 50 (a reconciliação já usa lotes de 50).
    // Esta rotina roda a cada 5 min e só precisa dos pedidos mais recentes; o histórico fica com a reconciliação.
    let ordersToFetch = Math.min(50, totalApiOrders);
    let offset = Math.max(0, totalApiOrders - ordersToFetch);

    if (offset > MAX_API_OFFSET_LIMIT) {
      offset = MAX_API_OFFSET_LIMIT;
      ordersToFetch = Math.min(ordersToFetch, totalApiOrders - offset);
    }
    if (offset + ordersToFetch > 10000) ordersToFetch = Math.max(1, 10000 - offset);

    const url = `${LI_API_BASE}/pedido?limit=${ordersToFetch}&offset=${offset}&_t=${timestamp}`;
    log.info(`[DEBUG] Fetching last ${ordersToFetch} orders with offset=${offset}`);

    const response = await fetch(url, {
      headers: { "Authorization": authHeader, "Cache-Control": "no-cache" },
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const orders = data.objects || [];
    log.info(`[DEBUG] API returned ${orders.length} orders`);

    if (orders.length === 0) {
      log.info(`[DEBUG] No orders returned from API`);
      return { success: true, synced: 0, errors: [], debug };
    }

    debug.apiOrders = orders.slice(0, 10).map((o: Record<string, unknown>) => ({ id: o.id, numero: o.numero }));

    const newOrders = orders.filter((o: Record<string, unknown>) => {
      const orderLiId = o.id ? Number(o.id) : 0;
      const isNew = orderLiId > effectiveLastLiId;
      if (isNew) {
        (debug.comparisonResults as unknown[]).push({
          api_numero: o.numero, api_li_id: orderLiId,
          last_li_id_db: effectiveLastLiId, is_new: true,
        });
      }
      return isNew;
    });

    log.info(`[DEBUG] Found ${newOrders.length} new orders (li_id > ${effectiveLastLiId})`);
    debug.newOrdersCount = newOrders.length;

    if (newOrders.length === 0) {
      log.info("[DEBUG] No new orders to sync");
      return { success: true, synced: 0, errors: [], debug };
    }

    newOrders.sort((a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.id) - Number(b.id));
    log.info(`[DEBUG] Processing ${newOrders.length} new orders: #${newOrders[0]?.numero} to #${newOrders[newOrders.length - 1]?.numero}`);

    for (const orderItem of newOrders) {
      try {
        let order = null;

        if (orderItem.numero) {
          const res = await fetch(`${LI_API_BASE}/pedido/${orderItem.numero}`, {
            headers: { "Authorization": authHeader },
          });
          if (res.ok) order = await res.json();
        }

        if (!order && orderItem.id) {
          const res = await fetch(`${LI_API_BASE}/pedido/${orderItem.id}`, {
            headers: { "Authorization": authHeader },
          });
          if (res.ok) order = await res.json();
        }

        if (!order) {
          log.info(`[DEBUG] Could not fetch details for order ${orderItem.numero}, using listing data`);

          let clienteId = null, clienteNome = null, clienteEmail = null, clienteTelefone = null;

          if (orderItem.cliente) {
            log.info(`[DEBUG] Order ${orderItem.numero} cliente field (fallback):`, JSON.stringify(orderItem.cliente));
            if (typeof orderItem.cliente === "object" && orderItem.cliente !== null) {
              clienteId = orderItem.cliente.id ? parseInt(orderItem.cliente.id) : null;
              clienteNome = orderItem.cliente.nome || null;
              clienteEmail = orderItem.cliente.email || null;
              clienteTelefone = orderItem.cliente.telefone_celular || orderItem.cliente.telefone_principal || null;
            } else if (typeof orderItem.cliente === "string") {
              const clienteMatch = orderItem.cliente.match(/\/cliente\/(\d+)/);
              if (clienteMatch) {
                clienteId = parseInt(clienteMatch[1]);
                try {
                  const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
                    headers: { "Authorization": authHeader },
                  });
                  if (clienteRes.ok) {
                    const cliente = await clienteRes.json();
                    clienteNome = cliente.nome || null;
                    clienteEmail = cliente.email || null;
                    clienteTelefone = cliente.telefone_celular || cliente.telefone_principal || null;
                  }
                } catch {
                  log.info(`[DEBUG] Could not fetch customer ${clienteId} for fallback order`);
                }
              }
            } else if (typeof orderItem.cliente === "number") {
              clienteId = orderItem.cliente;
            }
          }

          await supabase.from("li_orders").upsert({
            loja_integrada_order_id: orderItem.id,
            order_number: String(orderItem.numero),
            tenant_id: tenantId, integration_id: integrationId,
            created_at_remote: orderItem.data_criacao,
            customer_id: clienteId ? String(clienteId) : null,
            raw_json: {
              ...orderItem,
              cliente: typeof orderItem.cliente === "object"
                ? orderItem.cliente
                : { id: clienteId, nome: clienteNome, email: clienteEmail, telefone_celular: clienteTelefone },
            },
            updated_at_local: new Date().toISOString(),
            last_status_check_at: new Date().toISOString(),
          }, { onConflict: "integration_id,loja_integrada_order_id" });

          synced++;
          log.info(`[DEBUG] ✓ Saved basic order data: #${orderItem.numero} (li_id: ${orderItem.id}, cliente: ${clienteNome || "N/A"})`);
          continue;
        }

        await processOrder(supabase, order, tenantId, supabaseUrl, supabaseKey, authHeader, integrationId);
        synced++;
        log.info(`[DEBUG] ✓ Synced full order: #${order.numero} (li_id: ${order.id})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        errors.push(`Order ${orderItem.numero}: ${msg}`);
        log.error(`[DEBUG] ✗ Failed to sync order ${orderItem.numero}:`, msg);
      }
    }

    log.info(`[ORDERS] Sync complete: ${synced} new orders`);
    return { success: true, synced, errors, debug };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("[ORDERS] Sync error:", msg);
    return { success: false, synced: 0, errors: [msg], debug };
  }
}
