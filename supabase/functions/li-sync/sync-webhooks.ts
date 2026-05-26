import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

export async function registerWebhooks(
  supabase: ServiceClient, integrationId: string, authHeader: string, supabaseUrl: string
): Promise<{ success: boolean; message: string; webhooks_registered?: string[] }> {
  const webhookToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
  const notifyUrl = `${supabaseUrl}/functions/v1/li-webhook`;
  const registered: string[] = [];
  const errors: string[] = [];

  for (const entity of ['pedido', 'produto', 'cliente']) {
    try {
      const res = await fetch(`https://api.awsli.com.br/webhooks/v1/${entity}`, {
        method: 'PUT',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyUrl, token: webhookToken }),
      });
      if (res.ok) {
        registered.push(entity);
        log.info(`[LI-SYNC] Webhook registered for ${entity}`);
      } else {
        const errText = await res.text();
        errors.push(`${entity}: ${res.status} ${errText}`);
        log.error(`[LI-SYNC] Failed to register ${entity} webhook: ${res.status}`, errText);
      }
    } catch (e: unknown) {
      errors.push(`${entity}: ${(e as Error).message}`);
    }
  }

  if (registered.length === 0) {
    return { success: false, message: `Falha ao registrar webhooks: ${errors.join('; ')}` };
  }

  const { data: currentInt } = await supabase.from('integrations').select('metadata').eq('id', integrationId).single();
  const currentMetadata = (currentInt?.metadata && typeof currentInt.metadata === 'object') ? currentInt.metadata : {};

  await supabase.from('integrations').update({
    metadata: { ...currentMetadata, webhook_token: webhookToken, webhooks_registered: registered, webhooks_registered_at: new Date().toISOString() },
  }).eq('id', integrationId);

  const message = errors.length > 0
    ? `Webhooks registrados: ${registered.join(', ')}. Erros: ${errors.join('; ')}`
    : `Webhooks registrados com sucesso: ${registered.join(', ')}`;
  return { success: true, message, webhooks_registered: registered };
}
