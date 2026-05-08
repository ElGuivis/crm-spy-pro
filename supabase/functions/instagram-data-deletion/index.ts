import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function verifySignedRequest(
  signedRequest: string,
  appSecret: string
): Promise<Record<string, unknown> | null> {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;

  const [encodedSig, encodedPayload] = parts;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const payloadBytes = Uint8Array.from(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  if (encodedSig !== expectedSig) return null;

  return JSON.parse(new TextDecoder().decode(payloadBytes));
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-data-deletion", cid);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://spypro.com.br";

    if (!appSecret) {
      log.error("[data-deletion] INSTAGRAM_APP_SECRET não configurado");
      return new Response("Server error", { status: 500 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get("signed_request");

    if (!signedRequest) {
      log.warn("[data-deletion] signed_request ausente");
      return new Response("Bad Request", { status: 400 });
    }

    const payload = await verifySignedRequest(signedRequest, appSecret);
    if (!payload) {
      log.warn("[data-deletion] Assinatura inválida");
      return new Response("Forbidden", { status: 403 });
    }

    const igUserId = String(payload.user_id || payload.psid || "");
    const confirmationCode = `del_${igUserId}_${Date.now()}`;

    log.info(`[data-deletion] Solicitação de exclusão para usuário ${igUserId}, código ${confirmationCode}`);

    if (igUserId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Find channels for this IG user
      const { data: channels } = await supabase
        .from("instagram_channels")
        .select("id, tenant_id")
        .eq("ig_user_id", igUserId);

      if (channels && channels.length > 0) {
        const channelIds = channels.map((c: Record<string, unknown>) => c.id as string);

        // Delete messages and threads
        await supabase.from("instagram_messages").delete().in("channel_id", channelIds);
        await supabase.from("instagram_threads").delete().in("channel_id", channelIds);
        await supabase.from("instagram_contacts").delete().in("channel_id", channelIds);
        await supabase.from("instagram_event_log").delete().in("channel_id", channelIds);
        await supabase.from("instagram_webhook_deliveries").delete().in("channel_id", channelIds);
        await supabase.from("instagram_outbox").delete().in("channel_id", channelIds);
        await supabase.from("instagram_metrics_daily").delete().in("channel_id", channelIds);
        await supabase.from("instagram_channel_insights").delete().in("channel_id", channelIds);

        // Disconnect the channel itself
        await supabase
          .from("instagram_channels")
          .update({
            status: "disconnected",
            access_token_encrypted: null,
            metadata: { deleted_at: new Date().toISOString(), confirmation_code: confirmationCode }
          })
          .in("id", channelIds);

        log.info(`[data-deletion] Dados excluídos para ${channelIds.length} canal(is) do usuário ${igUserId}`);
      } else {
        log.info(`[data-deletion] Nenhum canal encontrado para usuário ${igUserId}`);
      }
    }

    // Meta requires a JSON response with url and confirmation_code
    return new Response(
      JSON.stringify({
        url: `${frontendUrl}/data-deletion?code=${confirmationCode}`,
        confirmation_code: confirmationCode,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[data-deletion] Erro:", msg);
    return new Response("Server error", { status: 500 });
  }
});
