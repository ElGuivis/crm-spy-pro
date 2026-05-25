/**
 * BLING WEBHOOKS - Edge Function para receber webhooks do Bling ERP
 *
 * URL de Produção: https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bling-webhooks
 *
 * O Bling assina cada payload com HMAC-SHA256 usando o Client Secret.
 * A assinatura vem no header X-Bling-Signature-256.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorrelationId, createLogger, type Logger } from "../_shared/correlation.ts";
import { verifyBlingSignature, generateEventKey, findIntegrationId } from './webhook-helpers.ts';
import { processProductEvent, processStockEvent } from './product-processor.ts';
import { processOrderEvent, processCustomerEvent } from './order-processor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bling-signature-256',
};

let log: Logger = createLogger("bling-webhooks", "init");

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  log = createLogger("bling-webhooks", cid);

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (req.method !== 'POST') {
    log.info('[Bling Webhook] Método não permitido:', req.method);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const BLING_CLIENT_SECRET = Deno.env.get('BLING_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BLING_CLIENT_SECRET) {
      log.error('[Bling Webhook] BLING_CLIENT_SECRET não configurado');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('X-Bling-Signature-256');

    log.info('[Bling Webhook] Recebendo webhook...');
    log.info('[Bling Webhook] Tamanho do payload:', rawBody.length, 'bytes');
    log.info('[Bling Webhook] Assinatura presente:', !!signature);

    const isValid = await verifyBlingSignature(rawBody, signature, BLING_CLIENT_SECRET, log);
    if (!isValid) {
      log.info('[Bling Webhook] Assinatura inválida - rejeitando webhook');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    log.info('[Bling Webhook] Assinatura válida');

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      log.error('[Bling Webhook] Erro ao parsear JSON:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const companyId = payload.companyId || null;
    const eventField = (payload.event || '') as string;
    const [resourceFromEvent, actionFromEvent] = eventField.includes('.') ? eventField.split('.') : [null, null];
    const resource = resourceFromEvent || payload.resource || 'unknown';
    const action = actionFromEvent || payload.action || 'unknown';
    const dataId = (payload.data as Record<string, unknown>)?.id || null;

    log.info('[Bling Webhook] Evento recebido:', { companyId, resource, action, dataId });

    const eventKey = generateEventKey(payload);
    log.info('[Bling Webhook] Event key:', eventKey);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: existingEvent } = await supabase.from('bling_webhook_events').select('id, status').eq('event_key', eventKey).maybeSingle();
    if (existingEvent) {
      log.info('[Bling Webhook] Evento duplicado - já processado:', existingEvent.id, existingEvent.status);
      return new Response(JSON.stringify({ ok: true, message: 'Event already processed' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let tenantId: string | null = null;
    if (companyId) {
      const { data: connection } = await supabase.from('bling_connections').select('tenant_id').eq('bling_company_id', companyId).eq('status', 'connected').maybeSingle();
      tenantId = connection?.tenant_id || null;
    }

    let status = 'received';
    let processResult: { success: boolean; message: string } | null = null;
    if (!tenantId) { log.info('[Bling Webhook] Tenant não encontrado para companyId:', companyId); status = 'ignored'; }

    const { data: insertedEvent, error: insertError } = await supabase
      .from('bling_webhook_events')
      .insert({ event_key: eventKey, tenant_id: tenantId, company_id: companyId || 'unknown', resource, action, payload, status })
      .select('id').single();

    if (insertError) {
      if (insertError.code === '23505') {
        log.info('[Bling Webhook] Evento duplicado (race condition) - já existe');
        return new Response(JSON.stringify({ ok: true, message: 'Event already exists' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      log.error('[Bling Webhook] Erro ao inserir evento:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save event' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    log.info('[Bling Webhook] Evento salvo com sucesso:', { id: insertedEvent.id, status, tenantId: tenantId || 'N/A' });

    if (tenantId) {
      const integrationId = await findIntegrationId(supabase, tenantId);

      if (integrationId) {
        if (resource === 'produtos' && dataId) {
          log.info('[Bling Webhook] Processando evento de produto...');
          processResult = await processProductEvent(supabase, tenantId, integrationId, action as string, dataId as number, insertedEvent.id, log);
        }

        if ((resource === 'estoques' || resource === 'stock' || resource === 'estoques_virtuais' || resource === 'virtual_stock') && payload.data) {
          log.info('[Bling Webhook] Processando evento de estoque...');
          processResult = await processStockEvent(supabase, tenantId, integrationId, action as string, payload.data as Record<string, unknown>, insertedEvent.id, log);
        }

        if ((resource === 'pedidos' || resource === 'pedidos.vendas') && dataId) {
          log.info('[Bling Webhook] Processando evento de pedido...');
          processResult = await processOrderEvent(supabase, tenantId, integrationId, action as string, dataId as number, insertedEvent.id, log);
        }

        if (resource === 'contatos' && dataId) {
          log.info('[Bling Webhook] Processando evento de contato...');
          processResult = await processCustomerEvent(supabase, tenantId, integrationId, action as string, dataId as number, insertedEvent.id, log);
        }

        if (processResult) {
          await supabase.from('bling_webhook_events').update({ status: processResult.success ? 'processed' : 'failed', error: processResult.success ? null : processResult.message, processed_at: new Date().toISOString() }).eq('id', insertedEvent.id);
          log.info('[Bling Webhook] Processamento concluído:', processResult);
        }
      } else {
        log.info('[Bling Webhook] Integration_id não encontrado para tenant:', tenantId);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: processResult?.success ?? false, message: processResult?.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    log.error('[Bling Webhook] Erro inesperado:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
