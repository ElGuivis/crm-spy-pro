import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import { readMelhorEnvioTokens } from "./credential-helpers.ts";
import { mapStatus } from "./melhor-envio-helpers.ts";

const ME_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_API_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";

export interface SyncTrackingOpts {
  supabase: ServiceClient;
  tenantId: string;
  corsHeaders: Record<string, string>;
  log: ReturnType<typeof createLogger>;
}

export async function handleSyncTracking(opts: SyncTrackingOpts): Promise<Response> {
  const { supabase, tenantId, corsHeaders, log } = opts;

  const { data: tokenRecord } = await supabase
    .from("melhor_envio_tokens")
    .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRecord) {
    return new Response(
      JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const tokens = await readMelhorEnvioTokens(supabase, tokenRecord);
  if (!tokens?.accessToken) {
    return new Response(
      JSON.stringify({ success: false, error: "Token expirado. Reconecte-se." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const meToken = tokens.accessToken;

  const { data: shipments } = await supabase
    .from("me_shipments")
    .select("id, me_id, tracking_code, status")
    .eq("tenant_id", tenantId)
    .not("status", "in", '("delivered","canceled","expired","returned")')
    .order("created_at", { ascending: false })
    .limit(50);

  if (!shipments || shipments.length === 0) {
    return new Response(
      JSON.stringify({ success: true, updated: 0, message: "Nenhum envio para atualizar" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  log.info(`[melhor-envio] Atualizando rastreio de ${shipments.length} envios`);

  let updatedCount = 0;

  for (let i = 0; i < shipments.length; i += 10) {
    const batch = shipments.slice(i, i + 10);
    const meIds = batch.map((s: Record<string, string>) => s.me_id).join(",");

    try {
      const trackingResponse = await fetch(
        `${ME_API_URL}/me/shipment/tracking?orders=${meIds}`,
        {
          headers: {
            "Authorization": `Bearer ${meToken}`,
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
          },
        },
      );

      const contentType = trackingResponse.headers.get("content-type") || "";

      if (!trackingResponse.ok) {
        const errorText = await trackingResponse.text();
        log.error(`[melhor-envio] Tracking API error ${trackingResponse.status}: ${errorText.substring(0, 200)}`);
        continue;
      }

      if (!contentType.includes("application/json")) {
        log.error(`[melhor-envio] Tracking API retornou Content-Type inválido: ${contentType}`);
        continue;
      }

      const trackingData = await trackingResponse.json();

      for (const shipment of batch) {
        const orderTracking = trackingData[shipment.me_id];
        if (!orderTracking) continue;

        const newStatus = mapStatus(orderTracking.status);
        const updateData: Record<string, unknown> = {
          tracking_events: orderTracking.events || [],
          last_sync_at: new Date().toISOString(),
        };

        if (newStatus !== shipment.status) updateData.status = newStatus;
        if (orderTracking.delivered_at) updateData.delivered_at = orderTracking.delivered_at;
        if (orderTracking.posted_at) updateData.posted_at = orderTracking.posted_at;

        await supabase.from("me_shipments").update(updateData).eq("id", shipment.id);
        updatedCount++;
      }
    } catch (err) {
      log.error(`[melhor-envio] Erro ao atualizar batch de rastreio:`, err);
    }
  }

  log.info(`[melhor-envio] ${updatedCount} rastreios atualizados`);

  return new Response(
    JSON.stringify({ success: true, updated: updatedCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

export interface SyncSingleOpts {
  supabase: ServiceClient;
  tenantId: string;
  bodyData: Record<string, unknown>;
  url: URL;
  corsHeaders: Record<string, string>;
  log: ReturnType<typeof createLogger>;
}

export async function handleSyncSingle(opts: SyncSingleOpts): Promise<Response> {
  const { supabase, tenantId, bodyData, url, corsHeaders, log } = opts;

  const shipmentId = typeof bodyData.shipment_id === "string"
    ? bodyData.shipment_id
    : url.searchParams.get("shipment_id");

  if (!shipmentId) {
    return new Response(
      JSON.stringify({ success: false, error: "shipment_id é obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: tokenRecord } = await supabase
    .from("melhor_envio_tokens")
    .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRecord) {
    return new Response(
      JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const tokens = await readMelhorEnvioTokens(supabase, tokenRecord);
  if (!tokens?.accessToken) {
    return new Response(
      JSON.stringify({ success: false, error: "Token expirado. Reconecte-se." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const meToken = tokens.accessToken;

  const { data: shipment } = await supabase
    .from("me_shipments")
    .select("id, me_id, tracking_code, status, tenant_id, integration_id")
    .eq("id", shipmentId)
    .eq("tenant_id", tenantId)
    .single();

  if (!shipment) {
    return new Response(
      JSON.stringify({ success: false, error: "Envio não encontrado" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  log.info(`[melhor-envio] Sincronizando envio individual ${shipment.me_id}`);

  const trackingResponse = await fetch(
    `${ME_API_URL}/me/shipment/tracking?orders=${shipment.me_id}`,
    {
      headers: {
        "Authorization": `Bearer ${meToken}`,
        "Accept": "application/json",
        "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
      },
    },
  );

  const contentType = trackingResponse.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const textBody = await trackingResponse.text();
    log.error(`[melhor-envio] Resposta não é JSON: ${textBody.substring(0, 500)}`);
    return new Response(
      JSON.stringify({ success: false, error: "Token expirado ou erro na API. Tente reconectar a integração." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!trackingResponse.ok) {
    const errorBody = await trackingResponse.text();
    log.error(`[melhor-envio] Erro na API: ${trackingResponse.status} - ${errorBody}`);
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar rastreamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const trackingData = await trackingResponse.json();
  const orderTracking = trackingData[shipment.me_id];

  if (orderTracking) {
    await supabase.from("me_shipments").update({
      status: mapStatus(orderTracking.status),
      tracking_events: orderTracking.events || [],
      delivered_at: orderTracking.delivered_at || null,
      posted_at: orderTracking.posted_at || null,
      last_sync_at: new Date().toISOString(),
    }).eq("id", shipmentId);

    return new Response(
      JSON.stringify({ success: true, status: mapStatus(orderTracking.status) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: false, error: "Rastreamento não encontrado" }),
    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
