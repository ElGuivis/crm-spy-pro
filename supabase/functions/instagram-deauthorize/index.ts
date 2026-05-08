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

  // Decode base64url payload
  const payloadBytes = Uint8Array.from(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  if (encodedSig !== expectedSig) return null;

  return JSON.parse(new TextDecoder().decode(payloadBytes));
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-deauthorize", cid);

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");
    if (!appSecret) {
      log.error("[deauthorize] INSTAGRAM_APP_SECRET não configurado");
      return new Response("Server error", { status: 500 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get("signed_request");

    if (!signedRequest) {
      log.warn("[deauthorize] signed_request ausente");
      return new Response("Bad Request", { status: 400 });
    }

    const payload = await verifySignedRequest(signedRequest, appSecret);
    if (!payload) {
      log.warn("[deauthorize] Assinatura inválida");
      return new Response("Forbidden", { status: 403 });
    }

    const igUserId = String(payload.user_id || payload.psid || "");
    log.info(`[deauthorize] Usuário ${igUserId} removeu o app`);

    if (igUserId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Mark channel as disconnected
      const { error } = await supabase
        .from("instagram_channels")
        .update({ status: "disconnected", metadata: { deauthorized_at: new Date().toISOString() } })
        .eq("ig_user_id", igUserId);

      if (error) {
        log.error(`[deauthorize] Erro ao atualizar canal: ${error.message}`);
      } else {
        log.info(`[deauthorize] Canal do usuário ${igUserId} marcado como disconnected`);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[deauthorize] Erro:", msg);
    return new Response("Server error", { status: 500 });
  }
});
