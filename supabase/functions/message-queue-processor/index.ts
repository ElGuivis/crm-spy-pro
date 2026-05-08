import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { readSmtpPassword } from "../_shared/credential-helpers.ts";
import { sendEmail as sharedSendEmail, getEmailConfig } from "../_shared/email-sender.ts";
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
    const now = new Date();

    // Fetch messages ready to process
    const { data: messages, error: fetchError } = await supabase
      .from('message_queue')
      .select('id, tenant_id, channel, recipient, message_content, subject, html_content, whatsapp_integration_id, email_integration_id, status, retry_count, max_retries, next_retry_at, last_error, reference_type, reference_id, metadata')
      .in('status', ['pending', 'processing'])
      .lte('next_retry_at', now.toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(50);

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
            failed++;
            continue;
          }
        }
      }

      // PRE-SEND VALIDATION: Check if order status has changed (for order_notification messages)
      if (msg.reference_type === 'order_notification' && msg.metadata?.expected_status && msg.reference_id) {
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
        
        if (currentStatusName && currentStatusName !== expectedStatus) {
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ⏭️ Message ${msg.id} CANCELLED - Order #${orderNumber} status changed from "${expectedStatus}" to "${currentStatusName}"`);
          await supabase.from('message_queue').update({
            status: 'cancelled',
            last_error: `Status do pedido alterou de "${expectedStatus}" para "${currentStatusName}" - mensagem cancelada`
          }).eq('id', msg.id);
          
          await supabase.from('order_notification_executions')
            .update({ 
              status: 'cancelled',
              error_message: `Status alterou para "${currentStatusName}" antes do envio`
            })
            .eq('order_number', orderNumber)
            .eq('status', 'pending');
          
          failed++;
          continue;
        }
        
        log.info(`[MESSAGE-QUEUE-PROCESSOR] ✓ Order #${orderNumber} still has status "${expectedStatus}" - proceeding with send`);
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
            result = await sharedSendEmail(emailCfg, {
              to: msg.recipient,
              subject: msg.subject || 'Notificação',
              text: msg.message_content,
              html: msg.html_content || undefined,
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
        
        // Update order_notification_executions status to 'sent' if this is an order notification
        if (msg.reference_type === 'order_notification' && msg.metadata?.order_number) {
          const orderNumber = msg.metadata.order_number as string;
          await supabase.from('order_notification_executions')
            .update({ 
              status: 'sent',
              tokens_used: 1
            })
            .eq('order_number', orderNumber)
            .eq('channel', msg.channel)
            .eq('status', 'pending');
          log.info(`[MESSAGE-QUEUE-PROCESSOR] ✅ Updated execution log for order #${orderNumber}`);
        }
        
        sent++;
        log.info(`[MESSAGE-QUEUE-PROCESSOR] ✅ Message ${msg.id} sent`);
      } else {
        // Failed - check if we should retry
        const newRetryCount = msg.retry_count + 1;

        if (newRetryCount >= msg.max_retries) {
          // Max retries reached - mark as failed
          await supabase.from('message_queue').update({
            status: 'failed',
            retry_count: newRetryCount,
            last_error: result.error
          }).eq('id', msg.id);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[MESSAGE-QUEUE-PROCESSOR] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
