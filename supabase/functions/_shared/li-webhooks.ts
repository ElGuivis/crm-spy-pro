import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

// A API atual só tem webhook de pedido e de produto (o de cliente deixou de existir; clientes chegam junto com o pedido).
const WEBHOOK_ENTITIES = ["pedido", "produto"] as const;

/** Registra (ou re-registra) os webhooks da loja apontando para o li-webhook. Reaproveita o token já salvo. */
export async function registerWebhooks(
  supabase: ServiceClient, integrationId: string, authHeader: string, supabaseUrl: string
): Promise<{ success: boolean; message: string; webhooks_registered?: string[] }> {
  const { data: currentInt } = await supabase.from('integrations').select('metadata').eq('id', integrationId).single();
  const currentMetadata = (currentInt?.metadata && typeof currentInt.metadata === 'object') ? currentInt.metadata as Record<string, unknown> : {};
  const webhookToken = typeof currentMetadata.webhook_token === 'string' && currentMetadata.webhook_token
    ? currentMetadata.webhook_token
    : crypto.randomUUID().replace(/-/g, '').substring(0, 32);
  const notifyUrl = `${supabaseUrl}/functions/v1/li-webhook`;
  const registered: string[] = [];
  const errors: string[] = [];

  for (const entity of WEBHOOK_ENTITIES) {
    try {
      const res = await fetch(`https://api.awsli.com.br/webhooks/v1/${entity}`, {
        method: 'PUT',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyUrl, token: webhookToken }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        registered.push(entity);
        log.info(`[LI-SYNC] Webhook registered for ${entity}`);
      } else {
        const errText = await res.text();
        errors.push(`${entity}: ${res.status} ${errText.slice(0, 200)}`);
        log.error(`[LI-SYNC] Failed to register ${entity} webhook: ${res.status}`, errText.slice(0, 200));
      }
    } catch (e: unknown) {
      errors.push(`${entity}: ${(e as Error).message}`);
    }
  }

  if (registered.length === 0) {
    // 401 "Acesso negado": o Personal Token da loja não tem permissão de webhook (isso é do integrador/parceiro). Guarda o motivo para a tela mostrar.
    const denied = errors.some((e) => / 401 /.test(e));
    const reason = denied
      ? 'A loja recusou o registro de webhooks para este Personal Token (permissão de integrador). Os pedidos continuam sendo sincronizados a cada 5 minutos.'
      : errors.join('; ').slice(0, 300);
    await supabase.from('integrations').update({ metadata: { ...currentMetadata, webhooks_error: reason, webhooks_attempt_at: new Date().toISOString() } }).eq('id', integrationId);
    return { success: false, message: `Falha ao registrar webhooks: ${errors.join('; ')}` };
  }

  const { webhooks_error: _drop, ...cleanMetadata } = currentMetadata;
  await supabase.from('integrations').update({
    metadata: { ...cleanMetadata, webhook_token: webhookToken, webhooks_registered: registered, webhooks_registered_at: new Date().toISOString() },
  }).eq('id', integrationId);

  const message = errors.length > 0
    ? `Webhooks registrados: ${registered.join(', ')}. Erros: ${errors.join('; ')}`
    : `Webhooks registrados com sucesso: ${registered.join(', ')}`;
  return { success: true, message, webhooks_registered: registered };
}
