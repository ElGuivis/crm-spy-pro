import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { isCircuitClosed, recordSuccess, recordFailure } from "../_shared/circuit-breaker.ts";
import { sendToDeadLetter } from "../_shared/dead-letter.ts";
import { recordMetrics, startTimer } from "../_shared/metrics.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 5;
const FUNCTION_NAME = "process-outbound-queue";

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55') && cleaned.length <= 11) cleaned = '55' + cleaned;
  return cleaned;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = getCorrelationId(req);
  const log = createLogger(FUNCTION_NAME, correlationId);
  const elapsed = startTimer();

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: items, error: fetchError } = await supabase
      .from('outbound_queue')
      .select('id, to_phone_e164, payload_json, status, attempts, message_id, tenant_id, channel:whatsapp_channels(id, provider, provider_account_id, access_token)')
      .in('status', ['pending', 'failed'])
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(20);

    if (fetchError) {
      log.error("Error fetching queue", { error: fetchError.message });
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`Processing ${items.length} outbound queue items`);

    let processed = 0;
    let failed = 0;
    let dead = 0;

    for (const item of items) {
      try {
        await supabase.from('outbound_queue').update({ status: 'processing' }).eq('id', item.id);

        const channel = item.channel;
        if (!channel) throw new Error('Channel not found');

        const providerName = channel.provider;
        const tenantId = item.tenant_id;

        // Circuit breaker check
        const circuitConfig = { provider: providerName, tenantId };
        const circuitOk = await isCircuitClosed(circuitConfig);
        if (!circuitOk) {
          log.warn("Circuit open, skipping", { provider: providerName, itemId: item.id });
          // Put back to pending with delay
          await supabase.from('outbound_queue').update({
            status: 'failed',
            next_retry_at: new Date(Date.now() + 30000).toISOString(),
            last_error: 'Circuit breaker open',
          }).eq('id', item.id);
          failed++;
          continue;
        }

        const payload = item.payload_json as { text?: string; content?: string; quoted_message_id?: string; metadata?: Record<string, unknown> };
        let sendResult: Record<string, unknown>;

        if (providerName === 'evolution') {
          if (!evolutionApiUrl || !evolutionApiKey) throw new Error('Evolution API not configured');
          const instanceName = channel.provider_account_id;
          if (!instanceName) throw new Error('No instance name for channel');

          const baseUrl = evolutionApiUrl.replace(/\/$/, '');
          const toPhone = item.to_phone_e164;
          const isLid = toPhone.includes('@lid');

          const body: Record<string, unknown> = {
            number: isLid ? toPhone : formatPhoneNumber(toPhone),
            text: payload.text || payload.content,
          };

          if (isLid && payload.quoted_message_id) {
            body.quoted = {
              key: { remoteJid: toPhone.includes('@') ? toPhone : `${toPhone}@lid`, id: payload.quoted_message_id },
              message: { conversation: "" },
            };
          }

          const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          sendResult = await response.json();
          if (!response.ok) throw new Error(`Evolution API error: ${JSON.stringify(sendResult)}`);

          await recordSuccess(circuitConfig);

        } else if (providerName === 'meta') {
          const accessToken = channel.access_token;
          const phoneNumberId = channel.provider_account_id;
          if (!accessToken || !phoneNumberId) throw new Error('Meta channel not properly configured');

          const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: item.to_phone_e164.replace(/\D/g, ''),
              type: 'text',
              text: { body: payload.text || payload.content },
            }),
          });

          sendResult = await response.json();
          if (!response.ok) throw new Error(`Meta API error: ${JSON.stringify(sendResult)}`);

          await recordSuccess(circuitConfig);

        } else {
          throw new Error(`Unknown provider: ${providerName}`);
        }

        const providerMsgId = sendResult?.key?.id || sendResult?.messageId || sendResult?.messages?.[0]?.id;

        await supabase.from('outbound_queue').update({ status: 'sent' }).eq('id', item.id);

        if (item.message_id) {
          await supabase.from('messages').update({
            status: 'sent',
            provider_message_id: providerMsgId || null,
            metadata: { ...((payload.metadata as Record<string, unknown>) || {}), provider_response: sendResult },
          }).eq('id', item.message_id);
        }

        log.info(`Sent queue item`, { itemId: item.id, providerMsgId });
        processed++;
      } catch (err: unknown) {
        const errorMsg = err.message || 'Unknown error';
        const newAttempts = (item.attempts || 0) + 1;
        const tenantId = item.tenant_id;
        const providerName = (item.channel as Record<string, unknown>)?.provider;

        // Record circuit breaker failure
        if (providerName && tenantId) {
          await recordFailure({ provider: providerName, tenantId }, errorMsg);
        }

        if (newAttempts >= MAX_ATTEMPTS) {
          await supabase.from('outbound_queue').update({
            status: 'dead', attempts: newAttempts, last_error: errorMsg,
          }).eq('id', item.id);

          if (item.message_id) {
            await supabase.from('messages').update({
              status: 'failed', error_json: { error: errorMsg, attempts: newAttempts },
            }).eq('id', item.message_id);
          }

          // Send to unified dead letter queue
          await sendToDeadLetter({
            tenant_id: tenantId,
            source_queue: "outbound_queue",
            source_item_id: item.id,
            channel_type: "whatsapp",
            channel_id: (item.channel as Record<string, unknown>)?.id,
            destination: item.to_phone_e164,
            payload: item.payload_json as Record<string, unknown>,
            error_message: errorMsg,
            attempts: newAttempts,
            correlation_id: correlationId,
          });

          log.error(`Dead letter`, { itemId: item.id, attempts: newAttempts, error: errorMsg });
          dead++;
        } else {
          const backoffSeconds = 10 * Math.pow(3, newAttempts - 1);
          const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();

          await supabase.from('outbound_queue').update({
            status: 'failed', attempts: newAttempts, next_retry_at: nextRetry, last_error: errorMsg,
          }).eq('id', item.id);

          log.warn(`Retry scheduled`, { itemId: item.id, attempt: newAttempts, nextRetry });
          failed++;
        }
      }
    }

    log.info(`Queue results`, { processed, failed, dead });

    await recordMetrics({
      functionName: FUNCTION_NAME,
      correlationId,
      status: dead > 0 ? "error" : "ok",
      durationMs: elapsed(),
      itemsProcessed: processed,
      itemsFailed: failed,
      itemsDead: dead,
    });

    return new Response(JSON.stringify({ processed, failed, dead, correlationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    log.error("Worker error", { error: error.message });
    await recordMetrics({
      functionName: FUNCTION_NAME,
      correlationId,
      status: "error",
      durationMs: elapsed(),
      errorMessage: error.message,
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
