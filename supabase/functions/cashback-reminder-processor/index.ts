import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { readSmtpPassword } from "../_shared/credential-helpers.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";
import { sendWhatsAppMessage as sharedSendWhatsApp, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";

// Module-level logger (overridden per-request with correlation ID)
let log = createLogger("cashback-reminder-processor", "init");

// ============= UTILITY FUNCTIONS =============

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55') && cleaned.length <= 11) cleaned = '55' + cleaned;
  return cleaned;
}

async function sendEmail(
  smtpHost: string, smtpPort: number, smtpUser: string, smtpPass: string,
  senderName: string, senderEmail: string | undefined,
  to: string, subject: string, text: string, html?: string
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = new SMTPClient({
        connection: { hostname: smtpHost, port: smtpPort, tls: smtpPort === 465, auth: { username: smtpUser, password: smtpPass } }
      });
      await client.send({
        from: senderEmail ? `${senderName} <${senderEmail}>` : `${senderName} <${smtpUser}>`,
        to, subject, content: text, html: html || undefined
      });
      await client.close();
      log.info(`[EMAIL] ✅ Sent to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('auth')) return { success: false, error: errorMsg };
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
  }
  return { success: false, error: 'Max retries exceeded' };
}

// NOTE: Duplicate sendEmail removed — single definition above (lines 23-47)

// ============= MAIN PROCESSOR =============

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  log = createLogger("cashback-reminder-processor", cid);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date().toISOString().split('T')[0];
    log.info(`Processing reminders for date: ${today}`);

    const { data: pendingReminders, error: fetchError } = await supabase
      .from('cashback_reminders')
      .select(`*, coupon:generated_coupons(id, coupon_code, customer_name, customer_email, customer_phone, expires_at, used_at), config:cashback_configs(*, whatsapp_integration:integrations!cashback_configs_whatsapp_integration_id_fkey(id, metadata))`)
      .eq('status', 'pending')
      .lte('scheduled_date', today)
      .limit(50);

    if (fetchError) throw new Error(`Failed to fetch reminders: ${fetchError.message}`);

    if (!pendingReminders || pendingReminders.length === 0) {
      log.info('No pending reminders to process');
      return new Response(JSON.stringify({ success: true, message: 'No pending reminders', processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    log.info(`Found ${pendingReminders.length} pending reminders`);
    let processedCount = 0, successCount = 0, failedCount = 0;

    for (const reminder of pendingReminders) {
      processedCount++;
      
      if (reminder.coupon?.used_at) {
        await supabase.from('cashback_reminders').update({ status: 'skipped', error_message: 'Coupon already used' }).eq('id', reminder.id);
        continue;
      }

      if (reminder.coupon?.expires_at && new Date(reminder.coupon.expires_at) < new Date()) {
        await supabase.from('cashback_reminders').update({ status: 'skipped', error_message: 'Coupon already expired' }).eq('id', reminder.id);
        continue;
      }

      try {
        const tenantId = reminder.tenant_id;
        if (tenantId) {
          const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: 5 });
          if (!hasTokens) {
            await supabase.from('cashback_reminders').update({ status: 'skipped', error_message: 'Tokens insuficientes' }).eq('id', reminder.id);
            continue;
          }
        }

        let whatsappSent = false, emailSent = false;
        const config = reminder.config;

        // Send WhatsApp directly
        if (reminder.coupon?.customer_phone && evolutionUrl && evolutionApiKey && config?.whatsapp_integration?.metadata) {
          const metadata = config.whatsapp_integration.metadata as Record<string, unknown>;
          const instanceName = (metadata.instanceName || metadata.instance_name) as string;
          if (instanceName && reminder.message) {
            const waConfig: WhatsAppConfig = { evolutionApiUrl: evolutionUrl, evolutionApiKey, instanceName };
            const result = await sharedSendWhatsApp(waConfig, reminder.coupon.customer_phone, reminder.message);
            whatsappSent = result.success;

            // Create automation conversation for reminder
            if (whatsappSent && config?.whatsapp_integration_id) {
              try {
                await ensureAutomationConversation({
                  supabase,
                  tenantId: config.tenant_id,
                  customerPhone: reminder.coupon.customer_phone,
                  integrationId: config.whatsapp_integration_id,
                  messageContent: reminder.message,
                  automationType: 'cashback_reminder',
                  metadata: { customer_name: reminder.coupon.customer_name },
                });
              } catch (_e) { /* ignore */ }
            }
          }
        }

        // Send Email directly
        if (reminder.coupon?.customer_email && config?.send_via_email && config?.email_integration_id) {
          const { data: emailInt } = await supabase.from('email_integrations').select('id, name, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, is_active').eq('id', config.email_integration_id).single();
          if (emailInt?.smtp_host) {
            const smtpPass = await readSmtpPassword(supabase, emailInt) || "";
            const result = await sendEmail(emailInt.smtp_host, emailInt.smtp_port || 587, emailInt.smtp_user, smtpPass, emailInt.name || emailInt.sender_name || 'Loja', emailInt.sender_email, reminder.coupon.customer_email, `Lembrete: Seu cupom ${reminder.coupon.coupon_code} está expirando!`, reminder.message);
            emailSent = result.success;
          }
        }

        // Queue failed messages for retry
        if (!whatsappSent && reminder.coupon?.customer_phone && config?.whatsapp_integration_id) {
          await supabase.from('message_queue').insert({
            tenant_id: tenantId,
            channel: 'whatsapp',
            recipient: reminder.coupon.customer_phone,
            message_content: reminder.message,
            whatsapp_integration_id: config.whatsapp_integration_id,
            reference_type: 'cashback_reminder',
            reference_id: reminder.id,
            metadata: { coupon_code: reminder.coupon?.coupon_code, reminder_number: reminder.reminder_number }
          });
          log.info(`[CASHBACK-REMINDER] WhatsApp queued for retry - reminder ${reminder.id}`);
        }

        if (!emailSent && reminder.coupon?.customer_email && config?.send_via_email && config?.email_integration_id) {
          await supabase.from('message_queue').insert({
            tenant_id: tenantId,
            channel: 'email',
            recipient: reminder.coupon.customer_email,
            message_content: reminder.message,
            subject: `Lembrete: Seu cupom ${reminder.coupon.coupon_code} está expirando!`,
            email_integration_id: config.email_integration_id,
            reference_type: 'cashback_reminder',
            reference_id: reminder.id,
            metadata: { coupon_code: reminder.coupon?.coupon_code, reminder_number: reminder.reminder_number }
          });
          log.info(`[CASHBACK-REMINDER] Email queued for retry - reminder ${reminder.id}`);
        }

        // Mark as sent if at least one channel delivered or queued for retry
        const anyQueued = (!whatsappSent && reminder.coupon?.customer_phone && config?.whatsapp_integration_id) || (!emailSent && reminder.coupon?.customer_email && config?.send_via_email);
        
        if (whatsappSent || emailSent || anyQueued) {
          // Only deduct tokens if at least one channel actually delivered
          if ((whatsappSent || emailSent) && tenantId) {
            await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 5, _type: 'automation', _description: `Lembrete ${reminder.reminder_number} - Cupom ${reminder.coupon?.coupon_code}`, _reference_id: reminder.id });
          }
          await supabase.from('cashback_reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminder.id);
          await supabase.from('cashback_executions').insert({ config_id: reminder.config_id, coupon_id: reminder.coupon_id, reminder_id: reminder.id, coupon_code: reminder.coupon?.coupon_code, action_type: 'reminder_sent', status: (whatsappSent || emailSent) ? 'success' : 'queued', tokens_used: (whatsappSent || emailSent) ? 5 : 0, tenant_id: tenantId, metadata: { reminder_number: reminder.reminder_number, whatsapp_sent: whatsappSent, email_sent: emailSent } });
          successCount++;
        } else {
          throw new Error('No channels configured');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await supabase.from('cashback_reminders').update({ status: 'failed', error_message: errorMsg }).eq('id', reminder.id);
        await supabase.from('cashback_executions').insert({ config_id: reminder.config_id, coupon_id: reminder.coupon_id, reminder_id: reminder.id, coupon_code: reminder.coupon?.coupon_code, action_type: 'reminder_sent', status: 'failed', error_message: errorMsg, tokens_used: 0 });
        failedCount++;
      }
    }

    log.info(`Complete. Processed: ${processedCount}, Success: ${successCount}, Failed: ${failedCount}`);
    return new Response(JSON.stringify({ success: true, processed: processedCount, success_count: successCount, failed_count: failedCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Reminder processor error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
