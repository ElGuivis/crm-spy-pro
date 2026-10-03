// Token por instância na URL do webhook da Evolution API.
// A Evolution não envia o header `apikey` nos webhooks que emite (a validação anterior derrubou
// todas as mensagens), então nós mesmos cadastramos a URL da instância com um token no CAMINHO:
//   /functions/v1/whatsapp-webhook/<HMAC-SHA256(WA_WEBHOOK_SECRET, instanceName)>
// (no caminho, não na query: com webhookByEvents a Evolution anexa o nome do evento ao fim da URL).

import { hmacHex } from "./hmac-token.ts";
import { timingSafeEqual } from "./timing-safe.ts";

export async function waWebhookToken(instanceName: string): Promise<string | null> {
  const secret = Deno.env.get("WA_WEBHOOK_SECRET");
  return secret ? await hmacHex(secret, instanceName) : null;
}

/** URL do webhook da instância, com o token no caminho. null se o segredo não estiver configurado. */
export async function waWebhookUrl(supabaseUrl: string, instanceName: string): Promise<string | null> {
  const token = await waWebhookToken(instanceName);
  return token ? `${supabaseUrl}/functions/v1/whatsapp-webhook/${token}` : null;
}

/** Extrai o token do caminho: .../whatsapp-webhook/<token>[/<evento>] */
export function waTokenFromUrl(reqUrl: string): string | null {
  const parts = new URL(reqUrl).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("whatsapp-webhook");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
}

export async function verifyWaWebhookToken(instanceName: unknown, token: string | null): Promise<boolean> {
  if (typeof instanceName !== "string" || !instanceName || !token) return false;
  const expected = await waWebhookToken(instanceName);
  return !!expected && timingSafeEqual(expected, token.toLowerCase());
}
