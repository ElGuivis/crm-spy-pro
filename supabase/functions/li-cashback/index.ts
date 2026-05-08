import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";

import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger, type Logger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";
import { sendWhatsAppMessage as sharedSendWhatsApp, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { sendEmail as sharedSendEmail, getEmailConfig } from "../_shared/email-sender.ts";

let log: Logger = createLogger("li-cashback", "init");

const LI_API_BASE = 'https://api.awsli.com.br/v1';

interface CashbackPayload {
  order_id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cpf?: string;
  order_total: number;
  tenant_id?: string; // Optional: if provided, use this tenant instead of config lookup
  integration_id?: string; // FIX: Add integration_id for proper store isolation
}

// ============= UTILITY FUNCTIONS =============

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}


// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  log = createLogger("li-cashback", cid);

  try {
    requireInternalAuth(req);

    const payload: CashbackPayload = await req.json();
    log.info('Cashback request received:', JSON.stringify(payload));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active cashback config with WhatsApp integration
    // FIX: Use tenant_id AND integration_id from payload for proper multi-tenant/multi-store isolation
    let configQuery = supabase
      .from('cashback_configs')
      .select(`
        *,
        whatsapp_integration:integrations!cashback_configs_whatsapp_integration_id_fkey(id, name, type, status, metadata)
      `)
      .eq('is_active', true);
    
    if (payload.tenant_id) {
      configQuery = configQuery.eq('tenant_id', payload.tenant_id);
      log.info(`[CASHBACK] Using tenant_id from payload: ${payload.tenant_id}`);
    }
    
    // FIX: Filter by integration_id if provided
    if (payload.integration_id) {
      configQuery = configQuery.eq('integration_id', payload.integration_id);
      log.info(`[CASHBACK] Using integration_id from payload: ${payload.integration_id}`);
    }
    
    const { data: config, error: configError } = await configQuery
      .limit(1)
      .maybeSingle();

    // If email is enabled, fetch email integration data separately
    let emailIntegrationData = null;
    if (config?.send_via_email && config?.email_integration_id) {
      const { data: emailData } = await supabase
        .from('email_integrations')
        .select('id, name, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, is_active')
        .eq('id', config.email_integration_id)
        .maybeSingle();
      emailIntegrationData = emailData;
    }

    if (configError || !config) {
      log.info('No active cashback config found');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No active cashback configuration' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if tenant has enough tokens
    const CASHBACK_TOKEN_COST = 5;
    const tenantId = config.tenant_id;
    
    if (tenantId) {
      const { data: hasTokens } = await supabase.rpc('has_enough_tokens', {
        _tenant_id: tenantId,
        _amount: CASHBACK_TOKEN_COST
      });

      if (!hasTokens) {
        log.info('Tenant does not have enough tokens');
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Tokens insuficientes para executar automação de cashback' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    log.info('Active cashback config:', config);

    // Check minimum purchase value
    if (config.min_purchase_value && payload.order_total < config.min_purchase_value) {
      log.info(`Order total ${payload.order_total} is below minimum ${config.min_purchase_value}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Order total is below minimum purchase value of ${config.min_purchase_value}` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get API key from integration - FIX: Use integration_id from config or payload
    const integrationIdToUse = config.integration_id || payload.integration_id;
    
    let integrationQuery = supabase
      .from('integrations')
      .select('id, api_key')
      .eq('type', 'loja_integrada')
      .eq('status', 'connected');
    
    if (integrationIdToUse) {
      integrationQuery = integrationQuery.eq('id', integrationIdToUse);
      log.info(`[CASHBACK] Using specific integration: ${integrationIdToUse}`);
    }
    
    const { data: integration } = await integrationQuery
      .limit(1)
      .maybeSingle();

    if (!integration?.api_key) {
      throw new Error('No connected Loja Integrada integration found');
    }

    const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;

    // Calculate cashback amount
    let cashbackAmount = (payload.order_total * config.discount_percentage) / 100;
    const cashbackPercentage = config.discount_percentage;

    if (config.max_discount_value && cashbackAmount > config.max_discount_value) {
      log.info(`Cashback ${cashbackAmount} exceeds max ${config.max_discount_value}, capping`);
      cashbackAmount = config.max_discount_value;
    }

    // Generate unique 5-character coupon code
    const generateCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let couponCode = '';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      couponCode = generateCode();
      
      const { data: existingCoupon } = await supabase
        .from('generated_coupons')
        .select('id')
        .eq('coupon_code', couponCode)
        .maybeSingle();

      if (!existingCoupon) {
        break;
      }

      log.info(`Code ${couponCode} already exists, retrying...`);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique coupon code after multiple attempts');
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.coupon_duration_days);

    log.info(`Creating coupon: ${couponCode} with ${cashbackPercentage}% discount, expires: ${expiresAt.toISOString()}`);

    // Create coupon in Loja Integrada
    // FIX: Using fixed value (fixo) instead of percentage
    // The cashbackAmount is the calculated fixed value (percentage of order total)
    const couponPayload = {
      codigo: couponCode,
      tipo: 'fixo',  // LI API accepts 'fixo', 'porcentagem' or 'frete_gratis'
      valor: cashbackAmount,  // Using the calculated fixed amount
      validade: expiresAt.toISOString().split('T')[0],  // FIX: Correct field name is 'validade', not 'data_fim'
      quantidade: 1,  // Total quantity of coupons available = 1
      quantidade_por_cliente: 1,  // FIX: Max uses per customer (correct field name)
      ativo: true,
      aplicar_no_frete: false,
      descricao: `Cashback do pedido #${payload.order_number}`,
      // FIX: These fields are REQUIRED by the LI API
      condicao_cliente: 'todos_clientes',
      condicao_produto: 'todos_produtos'
    };

    log.info('Creating coupon in Loja Integrada:', couponPayload);

    const createCouponResponse = await fetch(`${LI_API_BASE}/cupom`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(couponPayload)
    });

    if (!createCouponResponse.ok) {
      const errorText = await createCouponResponse.text();
      log.error('Failed to create coupon:', createCouponResponse.status, errorText);
      
      await supabase.from('cashback_executions').insert({
        config_id: config.id,
        order_id: String(payload.order_id),
        order_number: payload.order_number,
        coupon_code: couponCode,
        action_type: 'coupon_created',
        status: 'failed',
        error_message: `Failed to create coupon in LI: ${createCouponResponse.status} - ${errorText}`,
        tokens_used: 1
      });
      
      throw new Error(`Failed to create coupon: ${createCouponResponse.status} - ${errorText}`);
    }

    const createdCoupon = await createCouponResponse.json();
    log.info('Coupon created in Loja Integrada:', createdCoupon);

    // Save coupon to database
    const { data: savedCoupon, error: saveError } = await supabase
      .from('generated_coupons')
      .insert({
        config_id: config.id,
        integration_id: integration?.id || config.integration_id || null,
        tenant_id: tenantId,
        coupon_code: couponCode,
        discount_percentage: cashbackPercentage,
        coupon_value: cashbackAmount,
        expires_at: expiresAt.toISOString(),
        order_id: payload.order_number,
        customer_name: payload.customer_name,
        customer_email: payload.customer_email,
        customer_phone: payload.customer_phone,
        customer_cpf: payload.customer_cpf || null
      })
      .select()
      .single();

    if (saveError) {
      log.error('Failed to save coupon to database:', saveError);
    } else {
      log.info('Coupon saved to database:', savedCoupon);
    }

    // Deduct tokens from tenant
    if (tenantId) {
      const { data: deductSuccess } = await supabase.rpc('deduct_tokens', {
        _tenant_id: tenantId,
        _amount: CASHBACK_TOKEN_COST,
        _type: 'automation',
        _description: `Cashback cupom ${couponCode} - Pedido #${payload.order_number}`,
        _reference_id: savedCoupon?.id || null
      });

      if (!deductSuccess) {
        log.error('Failed to deduct tokens');
      }
    }

    // Log successful coupon creation
    await supabase.from('cashback_executions').insert({
      config_id: config.id,
      coupon_id: savedCoupon?.id || null,
      order_id: String(payload.order_id),
      order_number: payload.order_number,
      coupon_code: couponCode,
      action_type: 'coupon_created',
      status: 'success',
      tokens_used: CASHBACK_TOKEN_COST,
      tenant_id: tenantId,
      metadata: {
        discount_percentage: cashbackPercentage,
        discount_value: cashbackAmount,
        expires_at: expiresAt.toISOString()
      }
    });

    // Prepare message data
    const customerFirstName = payload.customer_name.split(' ')[0];
    const formattedValidade = expiresAt.toLocaleDateString('pt-BR');
    const formattedValorCupom = `R$ ${cashbackAmount.toFixed(2).replace('.', ',')}`;

    // Schedule reminders if enabled
    const remindersToInsert = [];
    
    if (config.reminder_1_enabled && savedCoupon) {
      const reminder1Date = new Date(expiresAt);
      reminder1Date.setDate(reminder1Date.getDate() - (config.reminder_1_days_before || 7));
      
      const reminder1Message = (config.reminder_1_message || '')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade)
        .replace(/\{\{dias_restantes\}\}/g, String(config.reminder_1_days_before || 7));
      
      remindersToInsert.push({
        coupon_id: savedCoupon.id,
        config_id: config.id,
        tenant_id: tenantId,
        reminder_number: 1,
        scheduled_date: reminder1Date.toISOString().split('T')[0],
        status: 'pending',
        message: reminder1Message,
      });
    }
    
    if (config.reminder_2_enabled && savedCoupon) {
      const reminder2Date = new Date(expiresAt);
      reminder2Date.setDate(reminder2Date.getDate() - (config.reminder_2_days_before || 3));
      
      const reminder2Message = (config.reminder_2_message || '')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade)
        .replace(/\{\{dias_restantes\}\}/g, String(config.reminder_2_days_before || 3));
      
      remindersToInsert.push({
        coupon_id: savedCoupon.id,
        config_id: config.id,
        tenant_id: tenantId,
        reminder_number: 2,
        scheduled_date: reminder2Date.toISOString().split('T')[0],
        status: 'pending',
        message: reminder2Message,
      });
    }

    if (remindersToInsert.length > 0) {
      const { error: reminderError } = await supabase
        .from('cashback_reminders')
        .insert(remindersToInsert);
      
      if (reminderError) {
        log.error('Failed to schedule reminders:', reminderError);
      } else {
        log.info(`Scheduled ${remindersToInsert.length} reminders for coupon ${couponCode}`);
      }
    }

    // ============= SEND NOTIFICATIONS DIRECTLY =============
    let whatsappSent = false;
    let whatsappError: string | undefined;
    let emailSent = false;
    let emailError: string | undefined;

    // Send WhatsApp message directly
    if (config.send_via_whatsapp && payload.customer_phone && evolutionUrl && evolutionApiKey) {
      const whatsappIntegration = config.whatsapp_integration;
      
      if (whatsappIntegration?.metadata) {
        const metadata = whatsappIntegration.metadata as Record<string, unknown>;
        const instanceName = (metadata.instanceName || metadata.instance_name) as string;
        
        if (instanceName) {
          const messageTemplate = config.message_template || 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.';
          
          const formattedMessage = messageTemplate
            .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
            .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
            .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
            .replace(/\{\{cupom\}\}/g, couponCode)
            .replace(/\{\{validade\}\}/g, formattedValidade);

          log.info('[LI-CASHBACK] Sending WhatsApp message directly...');
          
          const waConfig: WhatsAppConfig = {
            evolutionApiUrl: evolutionUrl,
            evolutionApiKey,
            instanceName,
          };
          const result = await sharedSendWhatsApp(waConfig, payload.customer_phone, formattedMessage);
          
          whatsappSent = result.success;
          whatsappError = result.error;

          // Create automation conversation to prevent bot from responding to replies
          if (whatsappSent && whatsappIntegration?.id) {
            try {
              await ensureAutomationConversation({
                supabase,
                tenantId,
                customerPhone: payload.customer_phone,
                integrationId: whatsappIntegration.id,
                messageContent: formattedMessage,
                automationType: 'cashback',
                metadata: { customer_name: payload.customer_name },
              });
              log.info('[LI-CASHBACK] Automation conversation created/updated');
            } catch (autoConvErr) {
              log.error('[LI-CASHBACK] Failed to create automation conversation:', autoConvErr);
            }
          }
        }
      }
    }

    // Send Email directly if configured
    if (config.send_via_email && payload.customer_email && emailIntegrationData) {
      const emailBodyText = (config.email_body_text || '')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade);

      const emailBodyHtml = (config.email_body_html || '')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade);

      const emailSubject = (config.email_subject || 'Seu cupom de desconto!')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{cupom\}\}/g, couponCode);

      log.info('[LI-CASHBACK] Sending Email directly...');
      
      const { config: emailCfg, error: emailCfgErr } = await getEmailConfig(supabase, config.email_integration_id);
      if (emailCfg && !emailCfgErr) {
        const result = await sharedSendEmail(emailCfg, {
          to: payload.customer_email,
          subject: emailSubject,
          text: emailBodyText,
          html: emailBodyHtml || undefined,
        });
        emailSent = result.success;
        emailError = result.error;
      }
    }

    log.info(`[LI-CASHBACK] Notifications sent: WhatsApp=${whatsappSent}, Email=${emailSent}`);

    // Queue failed messages for retry
    if (!whatsappSent && config.send_via_whatsapp && payload.customer_phone && config.whatsapp_integration_id) {
      const messageTemplate = config.message_template || 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.';
      const formattedMessage = messageTemplate
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cliente_primeiro_nome\}\}/g, customerFirstName)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade);
      
      await supabase.from('message_queue').insert({
        tenant_id: tenantId,
        channel: 'whatsapp',
        recipient: payload.customer_phone,
        message_content: formattedMessage,
        whatsapp_integration_id: config.whatsapp_integration_id,
        reference_type: 'cashback',
        reference_id: savedCoupon?.id,
        metadata: { coupon_code: couponCode, customer_name: payload.customer_name }
      });
      log.info(`[LI-CASHBACK] WhatsApp queued for retry`);
    }

    if (!emailSent && config.send_via_email && payload.customer_email && config.email_integration_id) {
      const emailSubject = (config.email_subject || 'Seu cupom de desconto!')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{cupom\}\}/g, couponCode);
      const emailBodyText = (config.email_body_text || '')
        .replace(/\{\{cliente_nome\}\}/g, payload.customer_name)
        .replace(/\{\{valor_cupom\}\}/g, formattedValorCupom)
        .replace(/\{\{cupom\}\}/g, couponCode)
        .replace(/\{\{validade\}\}/g, formattedValidade);
      
      await supabase.from('message_queue').insert({
        tenant_id: tenantId,
        channel: 'email',
        recipient: payload.customer_email,
        message_content: emailBodyText,
        subject: emailSubject,
        html_content: config.email_body_html || undefined,
        email_integration_id: config.email_integration_id,
        reference_type: 'cashback',
        reference_id: savedCoupon?.id,
        metadata: { coupon_code: couponCode, customer_name: payload.customer_name }
      });
      log.info(`[LI-CASHBACK] Email queued for retry`);
    }

    // Log notification execution
    await supabase.from('cashback_executions').insert({
      config_id: config.id,
      coupon_id: savedCoupon?.id || null,
      order_id: String(payload.order_id),
      order_number: payload.order_number,
      coupon_code: couponCode,
      action_type: 'notification_sent',
      status: 'success',
      tokens_used: 0,
      tenant_id: tenantId,
      metadata: {
        whatsapp_sent: whatsappSent,
        whatsapp_error: whatsappError,
        email_sent: emailSent,
        email_error: emailError,
        queued_for_retry: !whatsappSent || !emailSent
      }
    });

    return new Response(JSON.stringify({ 
      success: true,
      coupon_code: couponCode,
      discount_percentage: cashbackPercentage,
      discount_value: cashbackAmount,
      expires_at: expiresAt.toISOString(),
      reminders_scheduled: remindersToInsert.length,
      notifications: {
        whatsapp_sent: whatsappSent,
        email_sent: emailSent
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Cashback error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
