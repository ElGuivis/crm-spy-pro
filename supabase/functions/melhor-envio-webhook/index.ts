import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-me-signature, x-me-timestamp, x-melhor-envio-signature, x-melhor-envio-timestamp",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MELHOR_ENVIO_WEBHOOK_SECRET = Deno.env.get("MELHOR_ENVIO_WEBHOOK_SECRET");

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Verify webhook signature using HMAC-SHA256
async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    log.info("[melhor-envio-webhook] Missing signature or secret");
    return false;
  }

  // Validate timestamp to prevent replay attacks (5 minute window)
  if (timestamp) {
    const webhookTime = parseInt(timestamp, 10) * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (Math.abs(now - webhookTime) > fiveMinutes) {
      log.info("[melhor-envio-webhook] Timestamp outside valid window");
      return false;
    }
  }

  try {
    // Create the signed payload (timestamp + body if timestamp provided, otherwise just body)
    const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Handle signature with or without prefix
    const cleanSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    return timingSafeEqual(expectedSignature.toLowerCase(), cleanSignature.toLowerCase());
  } catch (error) {
    log.error("[melhor-envio-webhook] Signature verification error:", error);
    return false;
  }
}

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
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.info(`[melhor-envio-webhook] Webhook recebido`);

  // Read raw body for signature verification
  const rawBody = await req.text();

  try {
    // Log headers for debugging signature format
    const signature = req.headers.get("x-me-signature") || req.headers.get("x-melhor-envio-signature");
    const timestamp = req.headers.get("x-me-timestamp") || req.headers.get("x-melhor-envio-timestamp");
    log.info(`[melhor-envio-webhook] Signature header: ${signature ? 'present' : 'absent'}, Timestamp: ${timestamp ? 'present' : 'absent'}`);
    
    // Signature verification disabled - Melhor Envio does not document signature headers
    log.info("[melhor-envio-webhook] Processing webhook (signature verification disabled)");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse webhook payload from raw body
    const payload = JSON.parse(rawBody);
    log.info(`[melhor-envio-webhook] Payload:`, JSON.stringify(payload, null, 2));

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
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    log.error("[melhor-envio-webhook] Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
