// Token por tenant na URL do webhook do Melhor Envio.
// O ME não assina os webhooks de forma documentada, então a URL cadastrada no painel
// carrega `?tenant=<id>&token=<hmac>`: HMAC-SHA256(MELHOR_ENVIO_WEBHOOK_SECRET, tenant_id).
// Cada tenant só consegue forjar eventos dos próprios envios.

import { timingSafeEqual } from "./timing-safe.ts";

const encoder = new TextEncoder();

export async function meWebhookToken(tenantId: string): Promise<string | null> {
  const secret = Deno.env.get("MELHOR_ENVIO_WEBHOOK_SECRET");
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(tenantId));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyMeWebhookToken(tenantId: string | null, token: string | null): Promise<boolean> {
  if (!tenantId || !token) return false;
  const expected = await meWebhookToken(tenantId);
  return !!expected && timingSafeEqual(expected, token.toLowerCase());
}
