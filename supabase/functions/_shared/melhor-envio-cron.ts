import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import { readMelhorEnvioTokens, writeMelhorEnvioTokens } from "./credential-helpers.ts";
import { mapStatus } from "./melhor-envio-helpers.ts";

const ME_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_CLIENT_ID = Deno.env.get("MELHOR_ENVIO_CLIENT_ID")!;
const ME_CLIENT_SECRET = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET")!;
const ME_API_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";
const ME_TOKEN_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/token"
  : "https://melhorenvio.com.br/oauth/token";

export interface CronSyncOpts {
  supabase: ServiceClient;
  corsHeaders: Record<string, string>;
  log: ReturnType<typeof createLogger>;
}

export async function handleCronSync(opts: CronSyncOpts): Promise<Response> {
  const { supabase, corsHeaders, log } = opts;

  log.info(`[melhor-envio] ========== CRON SYNC INICIADO ==========`);

  const { data: allTokens, error: tokensError } = await supabase
    .from("melhor_envio_tokens")
    .select("tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at");

  if (tokensError || !allTokens || allTokens.length === 0) {
    log.info(`[melhor-envio] CRON: Nenhum tenant conectado`);
    return new Response(
      JSON.stringify({ success: true, message: "Nenhum tenant conectado", tenants_processed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  log.info(`[melhor-envio] CRON: ${allTokens.length} tenants para processar`);

  let tenantsProcessed = 0;
  let totalShipmentsSynced = 0;
  let totalTrackingsUpdated = 0;

  for (const tokenRecord of allTokens) {
    try {
      const resolvedTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
      let currentAccessToken = resolvedTokens?.accessToken || "";
      const currentRefreshToken = resolvedTokens?.refreshToken || "";

      const isExpired = new Date(tokenRecord.expires_at) < new Date();

      if (isExpired) {
        log.info(`[melhor-envio] CRON: Token expirado para tenant ${tokenRecord.tenant_id}, tentando renovar...`);

        const refreshResponse = await fetch(ME_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: ME_CLIENT_ID,
            client_secret: ME_CLIENT_SECRET,
            refresh_token: currentRefreshToken,
          }).toString(),
        });

        if (!refreshResponse.ok) {
          log.error(`[melhor-envio] CRON: Falha ao renovar token para tenant ${tokenRecord.tenant_id}`);
          continue;
        }

        const newTokens = await refreshResponse.json();
        const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString();

        await writeMelhorEnvioTokens(supabase, tokenRecord.tenant_id, newTokens.access_token, newTokens.refresh_token, {
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        });

        currentAccessToken = newTokens.access_token;
        log.info(`[melhor-envio] CRON: Token renovado para tenant ${tokenRecord.tenant_id}`);
      }

      log.info(`[melhor-envio] CRON: Sincronizando envios para tenant ${tokenRecord.tenant_id}`);

      let shipmentsSynced = 0;
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore && page <= 5) {
        const ordersResponse = await fetch(`${ME_API_URL}/me/orders?limit=${limit}&page=${page}`, {
          headers: {
            "Authorization": `Bearer ${currentAccessToken}`,
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
          },
        });

        if (!ordersResponse.ok) {
          const errText = await ordersResponse.text();
          log.error(`[melhor-envio] CRON: Erro ${ordersResponse.status} ao buscar página ${page} para tenant ${tokenRecord.tenant_id}: ${errText.substring(0, 200)}`);
          break;
        }

        const contentType = ordersResponse.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          log.warn(`[melhor-envio] CRON: Resposta não-JSON na página ${page}, content-type: ${contentType}`);
          break;
        }

        const ordersData = await ordersResponse.json();
        const orders = (ordersData.data || ordersData || []) as Record<string, unknown>[];

        if (orders.length === 0) {
          hasMore = false;
        } else {
          for (const order of orders) {
            try {
              const toAddress = (order.to || {}) as Record<string, unknown>;

              let estimatedDeliveryAt = null;
              if (order.posted_at && order.delivery_max) {
                const postedDate = new Date(order.posted_at as string);
                estimatedDeliveryAt = new Date(postedDate.getTime() + (order.delivery_max as number) * 24 * 60 * 60 * 1000).toISOString();
              }

              let externalOrderNumber = null;
              if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
                externalOrderNumber = (order.tags[0] as Record<string, unknown>)?.tag || null;
              }

              await supabase.from("me_shipments").upsert({
                tenant_id: tokenRecord.tenant_id,
                me_id: String(order.id),
                order_id: order.order_id || null,
                order_number: order.order_number || (order.invoice as Record<string, unknown>)?.key || null,
                external_order_number: externalOrderNumber,
                tracking_code: order.tracking || null,
                protocol: order.protocol || null,
                status: mapStatus(order.status as string),
                carrier: (order.service as Record<string, Record<string, string>>)?.company?.name || null,
                service_name: (order.service as Record<string, string>)?.name || null,
                price: order.price || null,
                discount: order.discount || null,
                format: order.format || null,
                weight: order.weight || null,
                insurance_value: order.insurance_value || null,
                from_address: order.from || null,
                to_address: order.to || null,
                receiver_name: toAddress.name || null,
                receiver_phone: toAddress.phone || null,
                receiver_city: toAddress.city || null,
                receiver_state: toAddress.state_abbr || toAddress.state || null,
                invoice: order.invoice || null,
                volumes: order.volumes || null,
                tags: order.tags || null,
                products: order.products || null,
                paid_at: order.paid_at || null,
                generated_at: order.generated_at || null,
                posted_at: order.posted_at || null,
                delivered_at: order.delivered_at || null,
                delivery_min: order.delivery_min || null,
                delivery_max: order.delivery_max || null,
                estimated_delivery_at: estimatedDeliveryAt,
                print_url: (order.print as Record<string, string>)?.url || null,
                preview_url: (order.preview as Record<string, string>)?.url || null,
                raw_data: order,
                last_sync_at: new Date().toISOString(),
              }, { onConflict: "tenant_id,me_id" });

              shipmentsSynced++;
            } catch (err) {
              log.error(`[melhor-envio] CRON: Erro ao salvar pedido ${order.id}:`, err);
            }
          }

          if (orders.length < limit) {
            hasMore = false;
          } else {
            page++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }

      totalShipmentsSynced += shipmentsSynced;

      const { data: inTransitShipments } = await supabase
        .from("me_shipments")
        .select("id, me_id, status")
        .eq("tenant_id", tokenRecord.tenant_id)
        .not("status", "in", '("delivered","canceled","expired","returned")')
        .limit(50);

      if (inTransitShipments && inTransitShipments.length > 0) {
        for (let i = 0; i < inTransitShipments.length; i += 10) {
          const batch = inTransitShipments.slice(i, i + 10);
          const meIds = batch.map((s: Record<string, string>) => s.me_id).join(",");

          try {
            const trackingResponse = await fetch(
              `${ME_API_URL}/me/shipment/tracking?orders=${meIds}`,
              {
                headers: {
                  "Authorization": `Bearer ${currentAccessToken}`,
                  "Accept": "application/json",
                  "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
                },
              },
            );

            if (trackingResponse.ok) {
              const trackingData = await trackingResponse.json();
              for (const shipment of batch) {
                const orderTracking = trackingData[shipment.me_id];
                if (orderTracking) {
                  await supabase.from("me_shipments").update({
                    status: mapStatus(orderTracking.status),
                    tracking_events: orderTracking.events || [],
                    delivered_at: orderTracking.delivered_at || null,
                    posted_at: orderTracking.posted_at || null,
                    last_sync_at: new Date().toISOString(),
                  }).eq("id", shipment.id);
                  totalTrackingsUpdated++;
                }
              }
            }
          } catch (err) {
            log.error(`[melhor-envio] CRON: Erro ao atualizar rastreio:`, err);
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      await supabase
        .from("integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("tenant_id", tokenRecord.tenant_id)
        .eq("type", "melhor_envio");

      tenantsProcessed++;
      log.info(`[melhor-envio] CRON: Tenant ${tokenRecord.tenant_id} - ${shipmentsSynced} envios, ${inTransitShipments?.length || 0} rastreios`);
    } catch (err) {
      log.error(`[melhor-envio] CRON: Erro ao processar tenant ${tokenRecord.tenant_id}:`, err);
    }
  }

  log.info(`[melhor-envio] ========== CRON SYNC FINALIZADO ==========`);
  log.info(`[melhor-envio] CRON: ${tenantsProcessed} tenants, ${totalShipmentsSynced} envios, ${totalTrackingsUpdated} rastreios`);

  return new Response(
    JSON.stringify({
      success: true,
      tenants_processed: tenantsProcessed,
      shipments_synced: totalShipmentsSynced,
      trackings_updated: totalTrackingsUpdated,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
