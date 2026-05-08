/**
 * Evolution API Webhook & Phone Management Handlers
 * Extracted from evolution-api/index.ts for maintainability.
 *
 * Handles: check-webhook, reconfigure-webhook, update-phone-number
 */

import type { ActionContext } from "./evolution-api-instance.ts";

/** Instance shape from Evolution API */
interface EvolutionInstance {
  instance?: { instanceName?: string; owner?: string; ownerJid?: string; wuid?: string; [key: string]: unknown };
  instanceName?: string; owner?: string; ownerJid?: string; wuid?: string;
  [key: string]: unknown;
}

export async function handleCheckWebhook(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[check-webhook] Checking for: ${ctx.instanceName}`);

  const webhookResponse = await fetch(`${ctx.baseUrl}/webhook/find/${ctx.instanceName}`, {
    method: 'GET', headers: { 'apikey': ctx.evolutionApiKey },
  });
  if (!webhookResponse.ok) throw new Error(`Failed to check webhook: ${await webhookResponse.text()}`);

  const webhookData = await webhookResponse.json();
  return new Response(JSON.stringify({ success: true, webhook: webhookData }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleReconfigureWebhook(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[reconfigure-webhook] For: ${ctx.instanceName}`);

  const webhookUrl = `${ctx.supabaseUrl}/functions/v1/whatsapp-webhook`;
  const webhookResponse = await fetch(`${ctx.baseUrl}/webhook/set/${ctx.instanceName}`, {
    method: 'POST', headers: { 'apikey': ctx.evolutionApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, webhookByEvents: true, webhookBase64: true, events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'] } }),
  });
  if (!webhookResponse.ok) throw new Error(`Failed to configure webhook: ${await webhookResponse.text()}`);

  const webhookData = await webhookResponse.json();
  ctx.log.info('[reconfigure-webhook] ✅ Configured');

  if (ctx.integrationId) {
    const { data: integration } = await ctx.supabase.from('integrations').select('metadata').eq('id', ctx.integrationId).single();
    const currentMeta = (integration?.metadata || {}) as Record<string, unknown>;
    await ctx.supabase.from('integrations').update({ metadata: { ...currentMeta, webhookConfigured: true, webhookUrl } }).eq('id', ctx.integrationId);
  }

  return new Response(JSON.stringify({ success: true, webhook: webhookData, webhookUrl }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleUpdatePhoneNumber(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName || !ctx.integrationId) throw new Error('Instance name and integration ID are required');
  ctx.log.info(`[update-phone-number] Fetching phone for instance: ${ctx.instanceName}`);

  let phoneNumber: string | null = null;

  // 1. Try fetchInstances
  const instancesResponse = await fetch(`${ctx.baseUrl}/instance/fetchInstances`, {
    method: 'GET', headers: { 'apikey': ctx.evolutionApiKey },
  });
  if (instancesResponse.ok) {
    const instances = await instancesResponse.json();
    const ourInstance = (instances as EvolutionInstance[])?.find?.((i: EvolutionInstance) =>
      i?.instance?.instanceName === ctx.instanceName || i?.instanceName === ctx.instanceName
    );
    if (ourInstance) {
      phoneNumber = ourInstance?.instance?.owner?.split('@')?.[0] ||
        ourInstance?.owner?.split('@')?.[0] ||
        ourInstance?.instance?.wuid?.split('@')?.[0] ||
        ourInstance?.wuid?.split('@')?.[0] || null;
    }
  }

  // 2. Try connectionState if not found
  if (!phoneNumber) {
    const stateResponse = await fetch(`${ctx.baseUrl}/instance/connectionState/${ctx.instanceName}`, {
      method: 'GET', headers: { 'apikey': ctx.evolutionApiKey },
    });
    if (stateResponse.ok) {
      const stateData = await stateResponse.json();
      phoneNumber = stateData?.instance?.owner?.split('@')?.[0] || stateData?.instance?.wuid?.split('@')?.[0] || null;
    }
  }

  if (phoneNumber) {
    const { data: integration } = await ctx.supabase.from('integrations').select('metadata').eq('id', ctx.integrationId).single();
    const currentMeta = (integration?.metadata || {}) as Record<string, unknown>;
    await ctx.supabase.from('integrations').update({ metadata: { ...currentMeta, phoneNumber, phoneNumberUpdatedAt: new Date().toISOString() } }).eq('id', ctx.integrationId);
    ctx.log.info(`[update-phone-number] ✅ Phone number updated: ${phoneNumber}`);
  } else {
    ctx.log.info(`[update-phone-number] ⚠️ Phone number not found`);
  }

  return new Response(JSON.stringify({ success: true, phoneNumber, updated: !!phoneNumber }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}
