/**
 * Evolution API Instance Management Handlers
 * Extracted from evolution-api/index.ts for maintainability.
 *
 * Handles: create, connect (QR), recreate, status, logout, delete
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { Logger } from "./correlation.ts";

type ServiceClient = ReturnType<typeof createClient>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** QR code / connection response from Evolution API */
interface EvolutionQRData {
  base64?: string;
  qrcode?: { base64?: string };
  code?: string;
  pairingCode?: string;
  count?: number;
  recreated?: boolean;
}

/** Instance shape from Evolution API fetchInstances */
interface EvolutionInstance {
  instance?: {
    instanceName?: string;
    instanceId?: string;
    owner?: string;
    state?: string;
    profilePictureUrl?: string;
    ownerJid?: string;
    profileName?: string;
    wuid?: string;
    [key: string]: unknown;
  };
  instanceName?: string;
  instanceId?: string;
  owner?: string;
  state?: string;
  wuid?: string;
  [key: string]: unknown;
}

interface ActionContext {
  supabase: ServiceClient;
  baseUrl: string;
  evolutionApiKey: string;
  supabaseUrl: string;
  corsHeaders: Record<string, string>;
  log: Logger;
  tenantId: string;
  instanceName?: string;
  integrationId?: string;
}

export async function handleFetchInstances(ctx: ActionContext): Promise<Response> {
  ctx.log.info('[fetch-instances] Listing all instances');
  const response = await fetch(`${ctx.baseUrl}/instance/fetchInstances`, {
    method: 'GET', headers: { 'apikey': ctx.evolutionApiKey },
  });
  if (!response.ok) {
    const errorText = await response.text();
    ctx.log.error('[fetch-instances] Failed:', response.status, errorText);
    throw new Error(`Failed to fetch instances: ${errorText}`);
  }
  const instances = await response.json();
  ctx.log.info(`[fetch-instances] Found ${Array.isArray(instances) ? instances.length : 0} instances`);
  return new Response(JSON.stringify({ success: true, instances }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleCreate(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  if (!ctx.tenantId) throw new Error('Tenant ID is required');

  const { data: hasTokens } = await ctx.supabase.rpc('has_enough_tokens', { _tenant_id: ctx.tenantId, _amount: 100 });
  if (!hasTokens) throw new Error('INSUFFICIENT_TOKENS');

  ctx.log.info(`[create] Creating instance: ${ctx.instanceName}`);
  const createResponse = await fetch(`${ctx.baseUrl}/instance/create`, {
    method: 'POST',
    headers: { 'apikey': ctx.evolutionApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceName: ctx.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    ctx.log.error('[create] Failed:', createResponse.status, errorText);
    let userFriendlyError = `Failed to create instance: ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson?.response?.message) {
        const messages = Array.isArray(errorJson.response.message) ? errorJson.response.message : [errorJson.response.message];
        const dup = messages.find((msg: string) => msg.includes('already in use') || msg.includes('já está em uso'));
        if (dup) userFriendlyError = 'INSTANCE_NAME_EXISTS';
        else userFriendlyError = messages.join(', ');
      }
    } catch { /* keep original */ }
    throw new Error(userFriendlyError);
  }

  const instanceData = await createResponse.json();
  ctx.log.info('[create] Instance created:', JSON.stringify(instanceData));

  const insertData: Record<string, unknown> = {
    name: ctx.instanceName, type: 'evolution_whatsapp', status: 'pending',
    metadata: { instanceName: ctx.instanceName, instanceId: instanceData.instance?.instanceId || instanceData.instanceId, apiKey: instanceData.hash || instanceData.apikey },
  };
  if (ctx.tenantId) insertData.tenant_id = ctx.tenantId;

  const { data: integration, error: dbError } = await ctx.supabase.from('integrations').insert(insertData).select().single();
  if (dbError) throw dbError;

  const { data: deducted } = await ctx.supabase.rpc('deduct_tokens', {
    _tenant_id: ctx.tenantId, _amount: 100, _type: 'inbox_creation',
    _description: `Nova caixa de entrada: ${ctx.instanceName}`, _reference_id: integration?.id,
  });
  if (!deducted) ctx.log.warn('[create] Failed to deduct tokens');
  else ctx.log.info('[create] ✅ 100 tokens deducted');

  return new Response(JSON.stringify({
    success: true, integration, qrcode: instanceData.qrcode,
    pairingCode: instanceData.pairingCode, code: instanceData.code,
  }), { headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' } });
}

export async function handleConnect(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[connect] Getting QR code for: ${ctx.instanceName}`);

  // Check current state
  try {
    const stateRes = await fetch(`${ctx.baseUrl}/instance/connectionState/${ctx.instanceName}`, { method: 'GET', headers: { 'apikey': ctx.evolutionApiKey } });
    if (stateRes.ok) {
      const stateData = await stateRes.json();
      const currentState = stateData.instance?.state || stateData.state || '';
      if (currentState === 'open') {
        return new Response(JSON.stringify({ success: true, isConnected: true, state: 'open' }), {
          headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  } catch { /* ignore */ }

  // QR code polling
  let qrData: EvolutionQRData | null = null;
  let restarted = false;
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${ctx.baseUrl}/instance/connect/${ctx.instanceName}`, { method: 'GET', headers: { 'apikey': ctx.evolutionApiKey } });
      if (!res.ok) { await sleep(2000); continue; }
      qrData = await res.json();
      const hasQr = Boolean(qrData?.base64 || qrData?.qrcode?.base64);
      const hasCode = Boolean(qrData?.code);
      if (hasQr || hasCode) { ctx.log.info('[connect] ✅ QR code/code obtained'); break; }

      if (qrData?.count === 0 && !restarted && attempt >= 1) {
        restarted = true;
        try {
          const restartRes = await fetch(`${ctx.baseUrl}/instance/restart/${ctx.instanceName}`, { method: 'PUT', headers: { 'apikey': ctx.evolutionApiKey } });
          if (restartRes.ok) { ctx.log.info('[connect] Instance restarted'); await sleep(2000); }
        } catch { /* ignore */ }
      }
      await sleep(2000);
    } catch { await sleep(2000); }
  }

  // Auto-recreate if QR unavailable
  const hasValidQr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code;
  if (!hasValidQr) {
    ctx.log.info('[connect] QR unavailable after attempts, auto-recreating instance...');
    try { await fetch(`${ctx.baseUrl}/instance/logout/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } }); await sleep(1000); } catch { /* ok */ }
    try { await fetch(`${ctx.baseUrl}/instance/delete/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } }); } catch { /* ok */ }
    await sleep(3000);
    const createRes = await fetch(`${ctx.baseUrl}/instance/create`, {
      method: 'POST', headers: { 'apikey': ctx.evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName: ctx.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    });
    if (createRes.ok) {
      const newData = await createRes.json();
      ctx.log.info('[connect] ✅ Instance recreated');
      qrData = { base64: newData.qrcode?.base64 || newData.qrcode, code: newData.code, pairingCode: newData.pairingCode, recreated: true };
      if (ctx.integrationId) {
        await ctx.supabase.from('integrations').update({
          status: 'pending', metadata: { instanceName: ctx.instanceName, instanceId: newData.instance?.instanceId || newData.instanceId, apiKey: newData.hash || newData.apikey, recreatedAt: new Date().toISOString() },
        }).eq('id', ctx.integrationId);
      }
    }
  }

  const needsRecreate = !qrData?.base64 && !qrData?.qrcode?.base64 && !qrData?.code;
  return new Response(JSON.stringify({
    success: true, qrcode: qrData?.base64 || qrData?.qrcode?.base64,
    pairingCode: qrData?.pairingCode, code: qrData?.code, count: qrData?.count, needsRecreate,
  }), { headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' } });
}

export async function handleRecreate(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[recreate] Recreating stale instance: ${ctx.instanceName}`);

  try { await fetch(`${ctx.baseUrl}/instance/logout/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } }); await sleep(1000); } catch { /* ok */ }
  try { await fetch(`${ctx.baseUrl}/instance/delete/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } }); } catch { /* ok */ }
  await sleep(3000);

  const createRes = await fetch(`${ctx.baseUrl}/instance/create`, {
    method: 'POST', headers: { 'apikey': ctx.evolutionApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceName: ctx.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
  });
  if (!createRes.ok) throw new Error(`Failed to recreate instance: ${await createRes.text()}`);

  const instanceData = await createRes.json();
  if (ctx.integrationId) {
    await ctx.supabase.from('integrations').update({
      status: 'pending', metadata: { instanceName: ctx.instanceName, instanceId: instanceData.instance?.instanceId || instanceData.instanceId, apiKey: instanceData.hash || instanceData.apikey, recreatedAt: new Date().toISOString() },
    }).eq('id', ctx.integrationId);
  }

  return new Response(JSON.stringify({ success: true, qrcode: instanceData.qrcode, pairingCode: instanceData.pairingCode, code: instanceData.code }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleStatus(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[status] Checking: ${ctx.instanceName}`);

  const statusResponse = await fetch(`${ctx.baseUrl}/instance/connectionState/${ctx.instanceName}`, { method: 'GET', headers: { 'apikey': ctx.evolutionApiKey } });
  if (!statusResponse.ok) {
    const errorText = await statusResponse.text();
    if (statusResponse.status === 404) {
      return new Response(JSON.stringify({ success: true, state: 'not_found', isConnected: false, exists: false }), {
        headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Failed to get status: ${errorText}`);
  }

  const statusData = await statusResponse.json();
  const state = statusData.instance?.state || statusData.state;
  const isConnected = state === 'open';

  if (isConnected && ctx.integrationId) {
    const webhookUrl = `${ctx.supabaseUrl}/functions/v1/whatsapp-webhook`;
    const instancePhoneNumber = await resolveInstancePhone(ctx);

    try {
      const webhookResponse = await fetch(`${ctx.baseUrl}/webhook/set/${ctx.instanceName}`, {
        method: 'POST', headers: { 'apikey': ctx.evolutionApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, webhookByEvents: true, webhookBase64: true, events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'] } }),
      });
      if (webhookResponse.ok) ctx.log.info('[status] ✅ Webhook configured');
      else ctx.log.error('[status] Webhook config failed:', await webhookResponse.text());
    } catch (webhookErr) { ctx.log.error('[status] Webhook error:', webhookErr); }

    const { data: existingIntegration } = await ctx.supabase.from('integrations').select('metadata').eq('id', ctx.integrationId).single();
    const existingMetadata = (existingIntegration?.metadata || {}) as Record<string, unknown>;

    await ctx.supabase.from('integrations').update({
      status: 'connected', last_sync_at: new Date().toISOString(),
      metadata: { ...existingMetadata, instanceName: ctx.instanceName, webhookConfigured: true, webhookUrl, phoneNumber: instancePhoneNumber, phoneNumberUpdatedAt: instancePhoneNumber ? new Date().toISOString() : existingMetadata.phoneNumberUpdatedAt },
    }).eq('id', ctx.integrationId);

    // Sync whatsapp_channels
    const phoneE164 = instancePhoneNumber ? `+${instancePhoneNumber}` : null;
    const { data: existingChannel } = await ctx.supabase.from('whatsapp_channels').select('id').eq('integration_id', ctx.integrationId).maybeSingle();
    if (existingChannel) {
      await ctx.supabase.from('whatsapp_channels').update({ status: 'connected', phone_e164: phoneE164 || undefined, display_name: ctx.instanceName }).eq('id', existingChannel.id);
    } else {
      const { data: integ } = await ctx.supabase.from('integrations').select('tenant_id').eq('id', ctx.integrationId).single();
      if (integ) {
        await ctx.supabase.from('whatsapp_channels').insert({
          tenant_id: integ.tenant_id, provider: 'evolution', display_name: ctx.instanceName,
          phone_e164: phoneE164, status: 'connected', integration_id: ctx.integrationId,
          provider_account_id: (existingMetadata.instanceName as string) || ctx.instanceName || null,
        });
      }
    }
  } else if (!isConnected && ctx.integrationId) {
    const newStatus = state === 'connecting' ? 'pending' : 'disconnected';
    await ctx.supabase.from('integrations').update({ status: newStatus }).eq('id', ctx.integrationId);
    if (newStatus === 'disconnected') {
      await ctx.supabase.from('whatsapp_channels').update({ status: 'disconnected' }).eq('integration_id', ctx.integrationId);
    }
  }

  return new Response(JSON.stringify({ success: true, state, isConnected, exists: true }), {
    headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleLogout(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[logout] Logging out: ${ctx.instanceName}`);
  const logoutResponse = await fetch(`${ctx.baseUrl}/instance/logout/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } });
  if (!logoutResponse.ok) ctx.log.error('[logout] Failed:', logoutResponse.status, await logoutResponse.text());
  else ctx.log.info('[logout] ✅ Logged out successfully');
  if (ctx.integrationId) await ctx.supabase.from('integrations').update({ status: 'disconnected' }).eq('id', ctx.integrationId);
  return new Response(JSON.stringify({ success: true }), { headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' } });
}

export async function handleDelete(ctx: ActionContext): Promise<Response> {
  if (!ctx.instanceName) throw new Error('Instance name is required');
  ctx.log.info(`[delete] Deleting: ${ctx.instanceName}`);
  const deleteResponse = await fetch(`${ctx.baseUrl}/instance/delete/${ctx.instanceName}`, { method: 'DELETE', headers: { 'apikey': ctx.evolutionApiKey } });
  if (!deleteResponse.ok) ctx.log.error('[delete] Failed:', deleteResponse.status, await deleteResponse.text());
  else ctx.log.info('[delete] ✅ Instance deleted from Evolution API');
  if (ctx.integrationId) { await ctx.supabase.from('integrations').delete().eq('id', ctx.integrationId); ctx.log.info('[delete] ✅ Integration deleted from database'); }
  return new Response(JSON.stringify({ success: true }), { headers: { ...ctx.corsHeaders, 'Content-Type': 'application/json' } });
}

/** Resolve instance phone number from multiple sources */
async function resolveInstancePhone(ctx: ActionContext): Promise<string | null> {
  let phone: string | null = null;
  try {
    const instancesRes = await fetch(`${ctx.baseUrl}/instance/fetchInstances`, { method: 'GET', headers: { 'apikey': ctx.evolutionApiKey } });
    if (instancesRes.ok) {
      const instances = await instancesRes.json();
      const thisInstance = Array.isArray(instances) ? instances.find((inst: EvolutionInstance) => inst.instance?.instanceName === ctx.instanceName) : null;
      if (thisInstance) {
        for (const field of [thisInstance.instance?.owner, thisInstance.instance?.ownerJid, thisInstance?.owner, thisInstance?.ownerJid]) {
          if (field && typeof field === 'string') {
            const extracted = field.replace('@s.whatsapp.net', '').replace(/\D/g, '');
            if (extracted && extracted.length >= 10) { phone = extracted; break; }
          }
        }
      }
    }
    if (!phone) {
      const connRes = await fetch(`${ctx.baseUrl}/instance/connectionState/${ctx.instanceName}`, { method: 'GET', headers: { 'apikey': ctx.evolutionApiKey } });
      if (connRes.ok) {
        const connData = await connRes.json();
        for (const field of [connData.instance?.user?.id, connData.instance?.profilePictureUrl, connData.instance?.profileName]) {
          if (field && typeof field === 'string') {
            const extracted = field.split('@')[0].replace(/\D/g, '');
            if (extracted && extracted.length >= 10) { phone = extracted; break; }
          }
        }
      }
    }
  } catch (err) { ctx.log.error('[status] Error fetching instance phone:', err); }
  return phone;
}

export type { ActionContext };
