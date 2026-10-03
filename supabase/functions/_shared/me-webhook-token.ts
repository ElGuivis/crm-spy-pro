// Token por tenant na URL do webhook do Melhor Envio.
// O ME não assina os webhooks de forma documentada, então a URL cadastrada no painel
// carrega `?tenant=<id>&token=<hmac>`: HMAC-SHA256(MELHOR_ENVIO_WEBHOOK_SECRET, tenant_id).
// Cada tenant só consegue forjar eventos dos próprios envios.

import { hmacHex } from "./hmac-token.ts";
import { timingSafeEqual } from "./timing-safe.ts";

export async function meWebhookToken(tenantId: string): Promise<string | null> {
  const secret = Deno.env.get("MELHOR_ENVIO_WEBHOOK_SECRET");
  return secret ? await hmacHex(secret, tenantId) : null;
}

export async function verifyMeWebhookToken(tenantId: string | null, token: string | null): Promise<boolean> {
  if (!tenantId || !token) return false;
  const expected = await meWebhookToken(tenantId);
  return !!expected && timingSafeEqual(expected, token.toLowerCase());
}
