import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { readSmtpPassword } from "../_shared/credential-helpers.ts";
import { sendEmail as sharedSendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { unsubscribeFor, withHtmlFooter, type SystemEmailKind } from "../_shared/email-unsubscribe-link.ts";
import { isAmbiguousSendError, isPermanentRecipientError } from "../_shared/outbound-errors.ts";
import { applyTracking, lookupTracking, normStatus } from "../_shared/order-notification-render.ts";
import { recordTouches } from "../_shared/contact-policy.ts";
import { sendWhatsAppMessage as sharedSendWhatsApp, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import type { MessageQueueRecord, EmailIntegrationRecord } from "../_shared/supabase-types.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

// Module-level logger (overridden per-request with correlation ID)
let log = createLogger("message-queue-processor", "init");

// Public (publishable) key fallback used by scheduled jobs.
// This is NOT a secret; it is the same public JWT used by the frontend.
// Some edge runtimes may not expose SUPABASE_PUBLISHABLE_KEY to functions.
const FALLBACK_PUBLISHABLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmd0bmFzdmVya2txa2JubXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjgyMzksImV4cCI6MjA5Mzc0NDIzOX0.spmW9Cn5TqQBIjLvWSD4yDOLNtYTXhhYC1PTO-1ck8U';

// Retry delays in minutes: 1, 5, 30
const RETRY_DELAYS = [1, 5, 30];
// Rastreio ainda inexistente na hora do envio: espera 30 min por vez, até 6 vezes (3 h), e então sai com texto neutro.
const TRACKING_WAIT_MIN = 30;
const TRACKING_MAX_WAITS = 6;
const TRACKING_FALLBACK = "ainda em preparação (você recebe o código assim que ele sair)";

type Supa = Parameters<typeof lookupTracking>[0];
/** Atualiza o registro de envio ligado à mensagem (pelo id exato; mensagens antigas sem id caem no critério anterior). */
async function setExecution(supabase: Supa, meta: Record<string, unknown> | null, channel: string, patch: Record<string, unknown>) {
  const id = meta?.execution_id as string | undefined;
  if (id) { await supabase.from('order_notification_executions').update(patch).eq('id', id); return; }
  const num = meta?.order_number as string | undefined;
  if (num) await supabase.from('order_notification_executions').update(patch).eq('order_number', num).eq('channel', channel).eq('status', 'pending');
}


Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  log = createLogger("message-queue-processor", cid);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  log.info('[MESSAGE-QUEUE-PROCESSOR] Starting...');

  try {
    requireInternalAuth(req);

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
    const supabaseKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required backend configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const sb = supabase as unknown as Supa; // os ajudantes compartilhados tipam o cliente de outro jeito (mesmo objeto)
    const now = new Date();

    // Fetch messages ready to process
    // Reivindica os itens numa instrucao so (FOR UPDATE SKIP LOCKED): ciclos sobrepostos nao enviam o mesmo item.
    const { data: claimed, error: claimError } = await supabase.rpc('claim_message_queue', { p_limit: 50 });
    const claimedIds = ((claimed ?? []) as Array<{ id: string }>).map((r) => r.id);
    const { data: messages, error: fetchError } = claimError || !claimedIds.length
      ? { data: [], error: claimError }
      : await supabase
        .from('message_queue')
        .select('id, tenant_id, channel, recipient, message_content, subject, html_content, whatsapp_integration_id, email_integration_id, status, retry_count, max_retries, next_retry_at, last_error, reference_type, reference_id, metadata')
        .in('id', claimedIds)
        .order('next_retry_at', { ascending: true });

    if (fetchError) throw new Error(`Failed to fetch messages: ${fetchError.message}`);

    if (!messages || messages.length === 0) {
      log.info('[MESSAGE-QUEUE-PROCESSOR] No messages to process');
      return new Response(JSON.stringify({ success: true, processed: 0 }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    log.info(`[MESSAGE-QUEUE-PROCESSOR] Found ${messages.length} messages`);
    let sent = 0, failed = 0, retrying = 0;

    for (const msg of messages) {
      // Mark as processing
      await supabase.from('message_queue').update({ status: 'processing' }).eq('id', msg.id);

      // GUARD: Skip order notifications for old orders (created more than 7 days ago)
      if (msg.reference_type === 'order_notification' && msg.reference_id) {
        const { data: orderAge } = await supabase
          .from('li_orders')
          .select('created_at_remote')
          .eq('id', msg.reference_id)
          .maybeSingle();
        
        if (orderAge?.created_at_remote) {
          const orderDate = new Date(orderAge.created_at_remote);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < sevenDaysAgo) {
            log.info(`[MESSAGE-QUEUE-PROCESSOR] ⏭️ Message ${msg.id} CANCELLED - order too old (${orderAge.created_at_remote})`);
            await supabase.from('message_queue').update({
              status: 'cancelled',
              last_error: `Pedido muito antigo (${orderAge.created_at_remote}) - proteção contra disparos em massa`
            }).eq('id', msg.id);
            await setExecution(sb, msg.metadata, msg.channel, { status: 'cancelled', error_message: 'Pedido muito antigo (proteção contra disparo em massa)' });
            failed++;
            continue;
          }
        }
      }

      // PRE-SEND VALIDATION: Check if order status has changed (for order_notification messages)
      // So vale quando a regra tem espera (ex.: 'Aguardando pagamento' em 10 min nao sai se o cliente ja pagou). Sem espera, o aviso do status em que o pedido entrou sempre sai.
      if (msg.reference_type === 'order_notification' && msg.metadata?.expected_status && Number(msg.metadata?.delay_minutes ?? 0) > 0 && msg.reference_id) {
        const expectedStatus = msg.metadata.expected_status as string;
        const orderNumber = msg.metadata.order_number as string || '';
        
        // Check current order status in li_orders OR bling_orders
        let currentStatusName: string | null = null;

        const { data: liOrder } = await supabase
          .from('li_orders')
          .select('status_name')
          .eq('id', msg.reference_id)
          .maybeSingle();

        if (liOrder) {
          currentStatusName = liOrder.status_name;
        } else {
          const { data: blingOrder } = await supabase
            .from('bling_orders')
            .select('situacao_nome')
            .eq('id', msg.reference_id)
            .maybeSingle();
          if (blingOrder) {
            currentStatusName = blingOrder.situacao_nome;
          }
        }
        
        if (currentStatusName && normStatus(currentStatusName) !== normStatus(expectedStatus)) {
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ⏭️ Message ${msg.id} CANCELLED - Order #${orderNumber} status changed from "${expectedStatus}" to "${currentStatusName}"`);
          await supabase.from('message_queue').update({
            status: 'cancelled',
            last_error: `Status do pedido alterou de "${expectedStatus}" para "${currentStatusName}" - mensagem cancelada`
          }).eq('id', msg.id);
          
          await setExecution(sb, msg.metadata, msg.channel, { status: 'cancelled', error_message: `Status alterou para "${currentStatusName}" antes do envio` });
          
          failed++;
          continue;
        }
        
        log.info(`[MESSAGE-QUEUE-PROCESSOR] ✓ Order #${orderNumber} still has status "${expectedStatus}" - proceeding with send`);
      }

      // Rastreio ainda inexistente quando a mensagem foi enfileirada: confere de novo agora; se nao ha, espera (ate 3 h) e so entao sai com texto neutro
      if (msg.metadata?.tracking_required && msg.reference_id) {
        const code = await lookupTracking(sb, msg.reference_id as string);
        const waits = Number(msg.metadata.tracking_waits ?? 0);
        if (code || waits >= TRACKING_MAX_WAITS) {
          const fill = code || TRACKING_FALLBACK;
          msg.message_content = applyTracking(msg.message_content, fill);
          msg.subject = msg.subject ? applyTracking(msg.subject, fill) : msg.subject;
          msg.html_content = msg.html_content ? applyTracking(msg.html_content, fill) : msg.html_content;
        } else {
          await supabase.from('message_queue').update({
            status: 'pending', next_retry_at: new Date(Date.now() + TRACKING_WAIT_MIN * 60_000).toISOString(),
            metadata: { ...msg.metadata, tracking_waits: waits + 1 }, last_error: 'Aguardando o código de rastreio',
          }).eq('id', msg.id);
          continue;
        }
      }

      // Check token balance before sending (1 token required for auto messages)
      const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { 
        _tenant_id: msg.tenant_id, 
        _amount: 1 
      });

      if (!hasTokens) {
        log.info(`[MESSAGE-QUEUE-PROCESSOR] ⚠️ Message ${msg.id} skipped - insufficient tokens`);
        await supabase.from('message_queue').update({
          status: 'failed',
          last_error: 'Tokens insuficientes para enviar mensagem automática'
        }).eq('id', msg.id);
        await setExecution(sb, msg.metadata, msg.channel, { status: 'failed', error_message: 'Tokens insuficientes' });
        failed++;
        continue;
      }

      let result: { success: boolean; error?: string } = { success: false, error: 'Unknown channel' };

      if (msg.channel === 'whatsapp') {
        if (!evolutionUrl || !evolutionApiKey) {
          result = { success: false, error: 'Evolution API not configured' };
        } else if (msg.whatsapp_integration_id) {
          const { data: integration } = await supabase
            .from('integrations')
            .select('metadata')
            .eq('id', msg.whatsapp_integration_id)
            .eq('status', 'connected')
            .single();

          if (integration?.metadata) {
            const metadata = integration.metadata as Record<string, unknown>;
            const instanceName = (metadata.instanceName || metadata.instance_name) as string;
            if (instanceName) {
              const waConfig: WhatsAppConfig = { evolutionApiUrl: evolutionUrl, evolutionApiKey, instanceName };
              result = await sharedSendWhatsApp(waConfig, msg.recipient, msg.message_content);
            } else {
              result = { success: false, error: 'Instance name not found' };
            }
          } else {
            result = { success: false, error: 'WhatsApp integration not found or disconnected' };
          }
        } else {
          result = { success: false, error: 'No WhatsApp integration configured' };
        }
      } else if (msg.channel === 'email') {
        if (msg.email_integration_id) {
          const { config: emailCfg, error: emailCfgErr } = await getEmailConfig(supabase, msg.email_integration_id);
          if (emailCfg && !emailCfgErr) {
            // e-mails de cashback (promocionais) que voltaram pela fila também levam o link de descadastro
            const kind: SystemEmailKind | null = msg.reference_type === 'cashback' ? 'cashback' : msg.reference_type === 'cashback_reminder' ? 'cashback_reminder' : null;
            const unsub = kind ? await unsubscribeFor(supabase, supabaseUrl, msg.tenant_id, kind, msg.recipient, (msg.metadata as Record<string, string> | null)?.customer_name) : null;
            result = await sharedSendEmail(emailCfg, {
              to: msg.recipient,
              subject: msg.subject || 'Notificação',
              text: unsub ? msg.message_content + unsub.textFooter : msg.message_content,
              html: msg.html_content ? (unsub ? withHtmlFooter(msg.html_content, unsub.htmlFooter) : msg.html_content) : undefined,
              headers: unsub?.headers,
            });
          } else {
            result = { success: false, error: emailCfgErr || 'Email integration not found' };
          }
        } else {
          result = { success: false, error: 'No email integration configured' };
        }
      }

      if (result.success) {
        // Deduct 1 token for auto message sent
        log.info(`[MESSAGE-QUEUE-PROCESSOR] 💰 Attempting to deduct 1 token - tenant: ${msg.tenant_id}`);
        const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
          _tenant_id: msg.tenant_id,
          _amount: 1,
          _type: 'auto_message',
          _description: `Mensagem automática enviada via ${msg.channel}`,
          _reference_id: msg.id
        });

        if (deductError) {
          log.error(`[MESSAGE-QUEUE-PROCESSOR] ❌ Error calling deduct_tokens RPC:`, deductError);
        } else if (!deducted) {
          log.warn(`[MESSAGE-QUEUE-PROCESSOR] ⚠️ deduct_tokens returned false for message ${msg.id}`);
        } else {
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ✅ 1 token deducted for message ${msg.id}`);
        }

        // Success - mark as sent
        await supabase.from('message_queue').update({
          status: 'sent',
          sent_at: now.toISOString(),
          last_error: null
        }).eq('id', msg.id);
        
        if (msg.reference_type === 'order_notification') {
          await setExecution(sb, msg.metadata, msg.channel, { status: 'sent', tokens_used: 1 });
          await recordTouches(sb, msg.tenant_id, [{ target: msg.channel === 'email' ? { email: msg.recipient } : { phone: msg.recipient }, channel: msg.channel as 'email' | 'whatsapp', purpose: 'order_status', ref: msg.reference_id }]);
        }

        sent++;
        log.info(`[MESSAGE-QUEUE-PROCESSOR] ✅ Message ${msg.id} sent`);
      } else {
        // Failed - check if we should retry
        const newRetryCount = msg.retry_count + 1;
        // Numero sem WhatsApp nao melhora repetindo; tempo esgotado pode ter saido (repetir duplicaria): em ambos nao repete.
        const unconfirmed = isAmbiguousSendError(result.error ?? '');
        const permanent = isPermanentRecipientError(result.error ?? '') || unconfirmed;

        if (permanent || newRetryCount >= msg.max_retries) {
          const finalError = unconfirmed ? `Envio não confirmado (tempo esgotado): não repetido para evitar mensagem duplicada. ${result.error}` : result.error;
          await supabase.from('message_queue').update({
            status: 'failed',
            retry_count: newRetryCount,
            last_error: finalError
          }).eq('id', msg.id);
          if (msg.reference_type === 'order_notification') await setExecution(sb, msg.metadata, msg.channel, { status: 'failed', error_message: finalError });
          failed++;
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ❌ Message ${msg.id} failed permanently: ${result.error}`);
        } else {
          // Schedule retry with exponential backoff
          const delayMinutes = RETRY_DELAYS[Math.min(newRetryCount - 1, RETRY_DELAYS.length - 1)];
          const nextRetry = new Date(now.getTime() + delayMinutes * 60 * 1000);

          await supabase.from('message_queue').update({
            status: 'pending',
            retry_count: newRetryCount,
            next_retry_at: nextRetry.toISOString(),
            last_error: result.error
          }).eq('id', msg.id);
          retrying++;
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ⏳ Message ${msg.id} retry ${newRetryCount} scheduled for ${nextRetry.toISOString()}`);
        }
      }
    }

    const duration = Date.now() - startTime;
    log.info(`[MESSAGE-QUEUE-PROCESSOR] Complete in ${duration}ms. Sent: ${sent}, Retrying: ${retrying}, Failed: ${failed}`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: messages.length,
      sent,
      retrying,
      failed,
      duration_ms: duration
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[MESSAGE-QUEUE-PROCESSOR] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
