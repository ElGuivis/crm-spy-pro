/**
 * Loja Integrada — updateOrderStatuses: poll LI API and sync status changes for existing orders.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
import { processOrderNotificationsInJob } from "./li-sync-carts.ts";

const log = createLogger("li-sync-orders", "shared");
type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function updateOrderStatuses(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; updated: number; checked: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  let checked = 0;

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let countQuery = supabase.from("li_orders").select("id", { count: "exact", head: true });
    if (integrationId) countQuery = countQuery.eq("integration_id", integrationId);
    const { count: totalPendingCount } = await countQuery;

    let ordersQuery = supabase
      .from("li_orders")
      .select("id, loja_integrada_order_id, order_number, status_id, status_name, created_at_remote, last_status_check_at, integration_id, raw_json, totals_json, shipping_json")
      .or(`last_status_check_at.is.null,last_status_check_at.lt.${fiveMinutesAgo}`)
      .order("created_at_remote", { ascending: false })
      .limit(200);
    if (integrationId) ordersQuery = ordersQuery.eq("integration_id", integrationId);

    const { data: ordersToCheck, error: fetchError } = await ordersQuery;

    if (fetchError) {
      log.error("[STATUS-UPDATE] Error fetching orders:", fetchError);
      return { success: false, updated: 0, checked: 0, errors: [fetchError.message] };
    }

    if (!ordersToCheck || ordersToCheck.length === 0) {
      log.info("[STATUS-UPDATE] No orders need status check (all checked within 5 min)");
      return { success: true, updated: 0, checked: 0, errors: [] };
    }

    log.info(`[STATUS-UPDATE] Checking ${ordersToCheck.length} orders (total pending: ${totalPendingCount || "unknown"})`);
    const neverChecked = ordersToCheck.filter((o: Record<string, unknown>) => !o.last_status_check_at).length;
    log.info(`[STATUS-UPDATE] ${neverChecked} never checked`);
    log.info(`[STATUS-UPDATE] First 3: ${ordersToCheck.slice(0, 3).map((o: Record<string, unknown>) => `#${o.order_number}:${o.status_name}`).join(", ")}`);

    let firstDebugLogged = false;

    for (const order of ordersToCheck) {
      checked++;
      try {
        const response = await fetch(`${LI_API_BASE}/pedido/${order.order_number}`, {
          headers: { "Authorization": authHeader, "Cache-Control": "no-cache" },
        });

        if (!response.ok) {
          log.info(`[STATUS-UPDATE] Failed to fetch order #${order.order_number}: ${response.status}`);
          continue;
        }

        const apiOrder = await response.json();

        if (!firstDebugLogged) {
          log.info(`[STATUS-UPDATE] API response sample for #${order.order_number}: situacao=${JSON.stringify(apiOrder.situacao)}`);
          firstDebugLogged = true;
        }

        let apiStatusId: number | null = null;
        let apiStatusNome: string | null = null;

        if (apiOrder.situacao) {
          if (typeof apiOrder.situacao === "object") {
            apiStatusId = apiOrder.situacao.id;
            apiStatusNome = apiOrder.situacao.nome;
          } else if (typeof apiOrder.situacao === "string") {
            const m = apiOrder.situacao.match(/\/situacao\/(\d+)/);
            if (m) apiStatusId = parseInt(m[1], 10);
          }
        }

        if (apiStatusId && !apiStatusNome) {
          try {
            const situacaoRes = await fetch(`${LI_API_BASE}/situacao/${apiStatusId}`, {
              headers: { "Authorization": authHeader },
            });
            if (situacaoRes.ok) {
              const situacao = await situacaoRes.json();
              apiStatusNome = situacao.nome || null;
            }
          } catch {
            // keep null
          }
        }

        let codigoRastreio = null;
        let urlRastreio = null;
        if (apiOrder.envios && Array.isArray(apiOrder.envios) && apiOrder.envios.length > 0) {
          const envio = apiOrder.envios[0];
          codigoRastreio = envio.codigo_rastreamento || envio.objeto || envio.rastreamento || null;
          urlRastreio = envio.url_rastreio || envio.url_rastreamento || envio.link_rastreamento || null;
        }

        const existingRaw = order.raw_json || {};
        const currentTrackingCode = existingRaw.codigo_rastreio || null;

        const mergedRaw = {
          ...existingRaw, ...apiOrder,
          codigo_rastreio: codigoRastreio || currentTrackingCode,
          url_rastreio: urlRastreio || existingRaw.url_rastreio || null,
        };

        const updateData: Record<string, unknown> = {
          status_id: apiStatusId || order.status_id,
          status_name: apiStatusNome || order.status_name,
          raw_json: mergedRaw,
          updated_at_local: new Date().toISOString(),
          last_status_check_at: new Date().toISOString(),
        };

        if (apiOrder.valor_total != null || apiOrder.valor_subtotal != null) {
          updateData.totals_json = {
            ...(order.totals_json || {}),
            subtotal: apiOrder.valor_subtotal != null ? parseFloat(apiOrder.valor_subtotal) : (order.totals_json?.subtotal || 0),
            total: apiOrder.valor_total != null ? parseFloat(apiOrder.valor_total) : (order.totals_json?.total || 0),
            shipping: apiOrder.valor_envio != null ? parseFloat(apiOrder.valor_envio) : (order.totals_json?.shipping || 0),
            discount: apiOrder.valor_desconto != null ? parseFloat(apiOrder.valor_desconto) : (order.totals_json?.discount || 0),
          };
        }

        const statusChanged = apiStatusId !== null && (apiStatusId !== order.status_id || apiStatusNome !== order.status_name);
        const currentTrackingCode2 = (order.raw_json as Record<string, unknown>)?.codigo_rastreio || null;
        const trackingChanged = codigoRastreio && codigoRastreio !== currentTrackingCode2;

        if (statusChanged) log.info(`[FULL-SYNC] Order #${order.order_number} status: "${order.status_name}" -> "${apiStatusNome}"`);
        if (trackingChanged) log.info(`[FULL-SYNC] Order #${order.order_number} tracking: ${codigoRastreio}`);

        // Track coupon usage
        const rawCouponCode = apiOrder.cupom_desconto || (order.raw_json?.cupom_desconto);
        const orderCouponCode = rawCouponCode ? String(rawCouponCode).trim() : null;
        if (orderCouponCode && tenantId) {
          const { data: matchedCoupon } = await supabase
            .from("generated_coupons")
            .select("id, used_at, coupon_code")
            .eq("coupon_code", orderCouponCode.toUpperCase())
            .eq("tenant_id", tenantId)
            .is("used_at", null)
            .maybeSingle();
          if (matchedCoupon) {
            log.info(`[COUPON-TRACKING] Order #${order.order_number} used coupon ${orderCouponCode}, marking as used`);
            await supabase.from("generated_coupons").update({
              used_at: new Date().toISOString(),
              used_in_order_id: String(order.order_number),
              used_order_value: apiOrder.valor_total ? parseFloat(apiOrder.valor_total) : (order.totals_json?.total || 0),
            }).eq("id", matchedCoupon.id);
          }
        }

        const { error: updateError } = await supabase.from("li_orders").update(updateData).eq("id", order.id);
        if (updateError) {
          log.error(`[FULL-SYNC] Error updating order #${order.order_number}:`, updateError);
          errors.push(`Order ${order.order_number}: ${updateError.message}`);
        } else {
          updated++;
        }

        // Cashback trigger on status change
        if (statusChanged && apiStatusNome && tenantId && order.integration_id) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

          const { data: cashbackConfig } = await supabase
            .from("cashback_configs")
            .select("trigger_statuses, is_active, id, integration_id, send_via_whatsapp, whatsapp_integration_id")
            .eq("tenant_id", tenantId)
            .eq("integration_id", order.integration_id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

          if (cashbackConfig?.trigger_statuses?.length > 0) {
            const shouldTrigger = (cashbackConfig.trigger_statuses as string[]).some(
              (trigger: string) => apiStatusNome!.toLowerCase() === trigger.toLowerCase(),
            );
            log.info(`[STATUS-CASHBACK] Order #${order.order_number} new status "${apiStatusNome}", trigger: ${shouldTrigger}`);

            if (shouldTrigger) {
              const { data: existingCoupon } = await supabase
                .from("generated_coupons").select("id")
                .eq("order_id", String(order.order_number)).eq("tenant_id", tenantId).maybeSingle();

              if (!existingCoupon) {
                let customerName = "Cliente", customerEmail = "", customerPhone = "", customerCpf = "";
                if (apiOrder.cliente && typeof apiOrder.cliente === "object") {
                  customerName = apiOrder.cliente.nome || "Cliente";
                  customerEmail = apiOrder.cliente.email || "";
                  customerPhone = apiOrder.cliente.telefone_celular || apiOrder.cliente.telefone_principal || "";
                  customerCpf = apiOrder.cliente.cpf || "";
                }
                log.info(`[STATUS-CASHBACK] Triggering cashback for order #${order.order_number}`);
                try {
                  const cashbackRes = await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
                    body: JSON.stringify({
                      order_id: apiOrder.id, order_number: String(order.order_number),
                      customer_name: customerName, customer_email: customerEmail,
                      customer_phone: customerPhone, customer_cpf: customerCpf,
                      order_total: parseFloat(apiOrder.valor_total || "0"),
                      tenant_id: tenantId, integration_id: order.integration_id,
                    }),
                  });
                  const cashbackResult = await cashbackRes.json();
                  log.info(`[STATUS-CASHBACK] Result for order #${order.order_number}:`, JSON.stringify(cashbackResult));
                } catch (e) {
                  log.error(`[STATUS-CASHBACK] Failed for order #${order.order_number}:`, e);
                }
              } else {
                log.info(`[STATUS-CASHBACK] Coupon already exists for order #${order.order_number}`);
              }
            }
          }
        }

        // Order notification trigger on status change
        if (statusChanged && apiStatusNome && tenantId && order.integration_id) {
          log.info(`[ORDER-NOTIFICATION] Triggering notification for order #${order.order_number}, status: "${apiStatusNome}"`);
          const rawData = order.raw_json || {};
          await processOrderNotificationsInJob(
            supabase,
            apiOrder,
            {
              ...order,
              numero: order.order_number,
              cliente_nome: rawData.cliente?.nome || "Cliente",
              cliente_telefone: rawData.cliente?.telefone_celular || rawData.cliente?.telefone_principal || "",
              cliente_email: rawData.cliente?.email || "",
              codigo_rastreio: codigoRastreio || rawData.codigo_rastreio || "",
              url_rastreio: urlRastreio || rawData.url_rastreio || "",
              valor_total: order.totals_json?.total || 0,
              li_id: order.loja_integrada_order_id,
              shipping_json: order.shipping_json || null,
              raw_json: order.raw_json || null,
            },
            apiStatusNome, tenantId, order.integration_id,
          );
        } else if (statusChanged) {
          log.info(`[ORDER-NOTIFICATION] Skipped for order #${order.order_number} - missing tenantId=${!!tenantId}, integrationId=${!!order.integration_id}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Unknown error";
        log.error(`[STATUS-UPDATE] Error checking order #${order.order_number}:`, errorMsg);
        errors.push(`Order ${order.order_number}: ${errorMsg}`);
      }
    }

    log.info(`[STATUS-UPDATE] Completed: checked ${checked} orders, updated ${updated} statuses`);
    return { success: true, updated, checked, errors };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    log.error("[STATUS-UPDATE] Error:", errorMsg);
    return { success: false, updated, checked, errors: [errorMsg] };
  }
}
