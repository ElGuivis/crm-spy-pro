import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { verifyMeWebhookToken } from "../_shared/me-webhook-token.ts";

// Webhook servidor-a-servidor: sem CORS de navegador.
const jsonHeaders = { "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mapear status do Melhor Envio para nosso sistema
function mapStatus(meStatus: string): string {
  const statusMap: Record<string, string> = {
    "draft": "pending",
    "pending": "pending",
    "released": "pending",
    "generated": "pending",
    "printed": "posted",
    "posted": "posted",
    "received": "received",
    "delivered": "delivered",
    "canceled": "canceled",
    "cancelled": "canceled",
    "undelivered": "in_transit",
    "paused": "in_transit",
    "suspended": "in_transit",
    "returning": "returning",
    "returned": "returned",
    "expired": "expired"
  };
  return statusMap[meStatus] || meStatus || "pending";
}

// Extract status from ME event name (e.g. "order.posted" -> "posted")
function statusFromEvent(eventName: string): string | null {
  if (!eventName) return null;
  const match = eventName.match(/^order\.(.+)$/);
  if (match) return match[1];
  return null;
}

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("melhor-envio-webhook", cid);
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  log.info(`[melhor-envio-webhook] Webhook recebido`);

  // Autenticação: ?tenant=<id>&token=<HMAC(tenant_id)> (o ME não assina de forma documentada)
  const reqUrl = new URL(req.url);
  const authTenantId = reqUrl.searchParams.get("tenant");
  if (!(await verifyMeWebhookToken(authTenantId, reqUrl.searchParams.get("token")))) {
    log.warn("[melhor-envio-webhook] Token ausente ou inválido");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const rawBody = await req.text();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse webhook payload from raw body
    const payload = JSON.parse(rawBody);
    log.info(`[melhor-envio-webhook] Payload recebido (${Array.isArray(payload) ? payload.length : 1} evento(s))`);

    // Formato do webhook do Melhor Envio (conforme docs oficiais):
    // { event: "order.posted", data: { id: "uuid", protocol: "...", status: "posted", tracking: "...", ... } }
    // Eventos: order.created, order.pending, order.released, order.generated,
    //          order.received, order.posted, order.delivered, order.cancelled,
    //          order.undelivered, order.paused, order.suspended

    const events = Array.isArray(payload) ? payload : [payload];

    let processedCount = 0;

    for (const event of events) {
      const eventType = event.event || event.type;
      const eventData = event.data || event;

      log.info(`[melhor-envio-webhook] Processando evento: ${eventType}`);

      // Derive status from event name if data.status is missing
      if (!eventData.status && eventType) {
        const derivedStatus = statusFromEvent(eventType);
        if (derivedStatus) {
          eventData.status = derivedStatus;
          log.info(`[melhor-envio-webhook] Status derivado do evento: ${derivedStatus}`);
        }
      }

      if (!eventData.id && !eventData.order_id) {
        log.info(`[melhor-envio-webhook] Evento sem ID, ignorando`);
        continue;
      }

      const meId = String(eventData.id || eventData.order_id);

      // Buscar o envio no banco
      const { data: shipment } = await supabase
        .from("me_shipments")
        .select("id, tenant_id, status")
        .eq("me_id", meId)
        .eq("tenant_id", authTenantId!)
        .maybeSingle();

      if (!shipment) {
        log.info(`[melhor-envio-webhook] Envio ${meId} não encontrado no banco`);
        
        // Se temos tenant_id no evento, podemos criar o registro
        if (eventData.company_id) {
          // Buscar tenant pelo company_id (se tivermos mapeamento)
          // Por ora, apenas logamos
          log.info(`[melhor-envio-webhook] Company ID: ${eventData.company_id}`);
        }
        continue;
      }

      // Preparar dados para atualização
      const updateData: Record<string, unknown> = {
        last_sync_at: new Date().toISOString()
      };

      // Atualizar status se presente
      if (eventData.status) {
        const newStatus = mapStatus(eventData.status);
        if (newStatus !== shipment.status) {
          updateData.status = newStatus;
          log.info(`[melhor-envio-webhook] Status atualizado: ${shipment.status} -> ${newStatus}`);
        }
      }

      // Atualizar tracking_code se presente
      if (eventData.tracking) {
        updateData.tracking_code = eventData.tracking;
      }

      // Atualizar datas se presentes
      if (eventData.posted_at) {
        updateData.posted_at = eventData.posted_at;
      }
      if (eventData.delivered_at) {
        updateData.delivered_at = eventData.delivered_at;
      }
      if (eventData.canceled_at) {
        updateData.canceled_at = eventData.canceled_at;
      }

      // Atualizar eventos de rastreio se presentes
      if (eventData.events || eventData.tracking_events) {
        updateData.tracking_events = eventData.events || eventData.tracking_events;
      }

      // Atualizar print_url se presente
      if (eventData.print?.url) {
        updateData.print_url = eventData.print.url;
      }

      // Salvar atualização
      const { error: updateError } = await supabase
        .from("me_shipments")
        .update(updateData)
        .eq("id", shipment.id);

      if (updateError) {
        log.error(`[melhor-envio-webhook] Erro ao atualizar envio ${meId}:`, updateError);
      } else {
        log.info(`[melhor-envio-webhook] Envio ${meId} atualizado com sucesso`);
        processedCount++;

        // Auto-link: if shipment has no li_order_id/bling_order_id, try to link now
        const { data: fullShipment } = await supabase
          .from("me_shipments")
          .select("id, tenant_id, li_order_id, bling_order_id, order_number, external_order_number, status")
          .eq("id", shipment.id)
          .maybeSingle();

        if (fullShipment) {
          const orderNum = fullShipment.external_order_number || fullShipment.order_number;
          
          // Auto-link to LI/Bling if not linked yet
          if (!fullShipment.li_order_id && !fullShipment.bling_order_id && orderNum) {
            // Try LI
            const { data: liOrder } = await supabase
              .from("li_orders")
              .select("id")
              .eq("tenant_id", fullShipment.tenant_id)
              .eq("order_number", String(orderNum))
              .maybeSingle();
            
            if (liOrder) {
              await supabase.from("me_shipments").update({ li_order_id: liOrder.id }).eq("id", fullShipment.id);
              log.info(`[melhor-envio-webhook] Auto-vinculado a LI pedido ${orderNum}`);
            } else {
              // Try Bling
              const { data: blingOrder } = await supabase
                .from("bling_orders")
                .select("id")
                .eq("tenant_id", fullShipment.tenant_id)
                .eq("numero", String(orderNum))
                .maybeSingle();
              
              if (blingOrder) {
                await supabase.from("me_shipments").update({ bling_order_id: blingOrder.id }).eq("id", fullShipment.id);
                log.info(`[melhor-envio-webhook] Auto-vinculado a Bling pedido ${orderNum}`);
              }
            }
          }

          // Propagar mudança de status para a Loja Integrada se relevante
          const newStatus = updateData.status as string | undefined;
          if (newStatus && (newStatus === "posted" || newStatus === "delivered")) {
            const liOrderId = fullShipment.li_order_id;
            const result = await syncStatusToLojaIntegrada(
              supabase,
              fullShipment.tenant_id,
              newStatus,
              liOrderId,
              orderNum ? String(orderNum) : null
            );
            if (result.success) {
              log.info(`[melhor-envio-webhook] Status propagado para LI: pedido ${result.order_number} -> ${result.new_status}`);
            } else {
              log.info(`[melhor-envio-webhook] Propagação LI ignorada: ${result.error}`);
            }
          }
        }
      }
    }

    log.info(`[melhor-envio-webhook] ${processedCount} eventos processados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${processedCount} eventos processados` 
      }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (error: unknown) {
    log.error("[melhor-envio-webhook] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
