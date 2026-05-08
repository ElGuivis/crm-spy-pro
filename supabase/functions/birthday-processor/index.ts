import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';
const BIRTHDAY_TOKEN_COST = 3;
const PAGE_SIZE = 1000;

interface BirthdayCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  source: 'loja_integrada' | 'bling';
}

function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'ANIV';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55') && cleaned.length <= 11) cleaned = '55' + cleaned;
  return cleaned;
}

/** Fetch all rows with pagination to bypass the 1000-row limit */
async function fetchAllRows<T>(
  query: { range: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("birthday-processor", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);

    log.info('[BIRTHDAY] Starting birthday processor...');

    // Get all active birthday configs
    const { data: configs, error: configsError } = await supabase
      .from('birthday_configs')
      .select(`
        *,
        whatsapp_integration:integrations!birthday_configs_whatsapp_integration_id_fkey(id, name, type, status, metadata),
        store_integration:integrations!birthday_configs_integration_id_fkey(id, name, type, status, api_key)
      `)
      .eq('is_active', true);

    if (configsError) {
      log.error('[BIRTHDAY] Error loading configs:', configsError);
      throw configsError;
    }

    if (!configs || configs.length === 0) {
      log.info('[BIRTHDAY] No active birthday configs found');
      return new Response(JSON.stringify({ success: true, message: 'No active configs', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[BIRTHDAY] Found ${configs.length} active config(s)`);

    const today = new Date();
    const todayMonth = today.getMonth() + 1; // 1-12
    const todayDay = today.getDate();
    let totalProcessed = 0;

    for (const config of configs) {
      try {
        const tenantId = config.tenant_id;
        const integrationId = config.integration_id;
        const storeType = config.store_integration?.type;

        log.info(`[BIRTHDAY] Processing config ${config.id} for tenant ${tenantId}, store type: ${storeType}`);

        // Check tokens
        const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: BIRTHDAY_TOKEN_COST });
        if (!hasTokens) {
          log.info(`[BIRTHDAY] Tenant ${tenantId} has insufficient tokens`);
          continue;
        }

        // Find birthday customers based on store type
        const birthdayCustomers: BirthdayCustomer[] = [];

        if (storeType === 'loja_integrada') {
          // Query li_customers — use only columns that exist: no birth_date column
          const customers = await fetchAllRows(
            supabase
              .from('li_customers')
              .select('id, name, phone, email, raw_json')
              .eq('integration_id', integrationId)
          );

          for (const c of customers) {
            // Birth date is only in raw_json.data_nascimento
            let birthDate: string | null = null;
            if (c.raw_json) {
              const rawJson = typeof c.raw_json === 'string' ? JSON.parse(c.raw_json) : c.raw_json;
              birthDate = rawJson?.data_nascimento || null;
            }

            if (birthDate) {
              const bd = new Date(birthDate);
              if (bd.getMonth() + 1 === todayMonth && bd.getDate() === todayDay) {
                birthdayCustomers.push({
                  name: c.name || 'Cliente',
                  phone: c.phone,
                  email: c.email,
                  source: 'loja_integrada',
                });
              }
            }
          }
        } else if (storeType === 'bling') {
          // Query bling_customers with birthday matching today
          const customers = await fetchAllRows(
            supabase
              .from('bling_customers')
              .select('id, nome, celular, telefone, email, data_nascimento')
              .eq('integration_id', integrationId)
          );

          for (const c of customers) {
            if (c.data_nascimento) {
              const bd = new Date(c.data_nascimento);
              if (bd.getMonth() + 1 === todayMonth && bd.getDate() === todayDay) {
                birthdayCustomers.push({
                  name: c.nome || 'Cliente',
                  phone: c.celular || c.telefone,
                  email: c.email,
                  source: 'bling',
                });
              }
            }
          }
        }

        log.info(`[BIRTHDAY] Found ${birthdayCustomers.length} birthday customer(s) for config ${config.id}`);

        if (birthdayCustomers.length === 0) continue;

        // Check which customers were already processed today
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const { data: alreadyProcessed } = await supabase
          .from('birthday_executions')
          .select('customer_phone, customer_email')
          .eq('config_id', config.id)
          .gte('created_at', todayStart)
          .in('status', ['sent', 'pending']);

        const processedKeys = new Set(
          (alreadyProcessed || []).map(e => `${e.customer_phone || ''}|${e.customer_email || ''}`)
        );

        // Get WhatsApp config
        let whatsappConfig: WhatsAppConfig | null = null;
        if (config.whatsapp_integration_id && evolutionUrl && evolutionApiKey) {
          const metadata = config.whatsapp_integration?.metadata as Record<string, unknown>;
          const instanceName = metadata?.instance_name || metadata?.instanceName;
          if (instanceName) {
            whatsappConfig = {
              evolutionApiUrl: evolutionUrl,
              evolutionApiKey: evolutionApiKey,
              instanceName,
            };
          }
        }

        // Get LI API auth for coupon creation (only for LI stores)
        const apiKey = config.store_integration?.api_key;
        const authHeader = apiKey ? `chave_api ${apiKey} aplicacao ${appKey}` : null;

        for (const customer of birthdayCustomers) {
          const customerKey = `${customer.phone || ''}|${customer.email || ''}`;
          if (processedKeys.has(customerKey)) {
            log.info(`[BIRTHDAY] Already processed ${customer.name} today, skipping`);
            continue;
          }

          // Check tokens again
          const { data: stillHasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: BIRTHDAY_TOKEN_COST });
          if (!stillHasTokens) {
            log.info(`[BIRTHDAY] Tokens exhausted for tenant ${tenantId}`);
            break;
          }

          try {
            // Generate coupon code
            const couponCode = generateCouponCode();
            
            // Create coupon in store API (LI only for now)
            if (storeType === 'loja_integrada' && authHeader) {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + config.coupon_duration_days);
              
              const couponPayload = {
                codigo: couponCode,
                tipo: 'porcentagem',
                valor: config.coupon_discount_percent,
                validade: expiresAt.toISOString().split('T')[0],
                quantidade: 1,
                quantidade_por_cliente: 1,
                ativo: true,
                aplicar_no_frete: false,
                descricao: `Aniversário - ${customer.name}`,
                condicao_cliente: 'todos_clientes',
                condicao_produto: 'todos_produtos',
              };

              const response = await fetch(`${LI_API_BASE}/cupom`, {
                method: 'POST',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(couponPayload),
              });

              if (!response.ok) {
                const errorText = await response.text();
                log.error(`[BIRTHDAY] Failed to create coupon for ${customer.name}: ${response.status} - ${errorText}`);
                
                await supabase.from('birthday_executions').insert({
                  tenant_id: tenantId,
                  config_id: config.id,
                  customer_name: customer.name,
                  customer_phone: customer.phone,
                  customer_email: customer.email,
                  customer_source: customer.source,
                  coupon_code: couponCode,
                  action_type: 'birthday_message',
                  status: 'failed',
                  error_message: `Coupon creation failed: ${errorText}`,
                });
                continue;
              }

              await response.json(); // consume body
            }

            // Build message — support both {{...}} and legacy {…} placeholders
            const firstName = customer.name.split(' ')[0];

            const message = (config.message_template || '')
              // Modern {{...}} placeholders
              .replace(/\{\{cliente_nome\}\}/g, customer.name)
              .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
              .replace(/\{\{nome\}\}/g, customer.name)
              .replace(/\{\{primeiro_nome\}\}/g, firstName)
              .replace(/\{\{desconto\}\}/g, String(config.coupon_discount_percent))
              .replace(/\{\{cupom\}\}/g, couponCode)
              .replace(/\{\{validade\}\}/g, String(config.coupon_duration_days))
              // Legacy {…} placeholders (backward compatibility)
              .replace(/\{nome\}/g, customer.name)
              .replace(/\{primeiro_nome\}/g, firstName)
              .replace(/\{desconto\}/g, String(config.coupon_discount_percent))
              .replace(/\{cupom\}/g, couponCode)
              .replace(/\{validade\}/g, String(config.coupon_duration_days));

            let sent = false;
            let errorMsg: string | null = null;

            // Send WhatsApp
            if (whatsappConfig && customer.phone) {
              const result = await sendWhatsAppMessage(whatsappConfig, customer.phone, message);
              if (result.success) {
                sent = true;
                log.info(`[BIRTHDAY] ✅ WhatsApp sent to ${customer.name}`);

                // Create automation conversation to prevent bot from responding
                if (config.whatsapp_integration_id) {
                  try {
                    await ensureAutomationConversation({
                      supabase,
                      tenantId,
                      customerPhone: customer.phone,
                      integrationId: config.whatsapp_integration_id,
                      messageContent: message,
                      automationType: 'birthday',
                      metadata: { customer_name: customer.name },
                    });
                  } catch (autoConvErr) {
                    log.error('[BIRTHDAY] Failed to create automation conversation:', autoConvErr);
                  }
                }
              } else {
                errorMsg = result.error || 'WhatsApp send failed';
                log.error(`[BIRTHDAY] WhatsApp failed for ${customer.name}: ${errorMsg}`);
              }
            }

            // Send Email
            if (config.email_enabled && config.email_integration_id && customer.email) {
              try {
                const { config: emailConfig, error: emailErr } = await getEmailConfig(supabase, config.email_integration_id);
                if (emailConfig && !emailErr) {
                  const emailSubject = (config.email_subject || 'Feliz Aniversário! 🎂')
                    .replace(/\{\{cliente_nome\}\}/g, customer.name)
                    .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
                    .replace(/\{\{cupom\}\}/g, couponCode)
                    .replace(/\{nome\}/g, customer.name)
                    .replace(/\{primeiro_nome\}/g, firstName)
                    .replace(/\{cupom\}/g, couponCode);

                  const emailBody = (config.email_body || message)
                    .replace(/\{\{cliente_nome\}\}/g, customer.name)
                    .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
                    .replace(/\{\{desconto\}\}/g, String(config.coupon_discount_percent))
                    .replace(/\{\{cupom\}\}/g, couponCode)
                    .replace(/\{\{validade\}\}/g, String(config.coupon_duration_days))
                    .replace(/\{nome\}/g, customer.name)
                    .replace(/\{primeiro_nome\}/g, firstName)
                    .replace(/\{desconto\}/g, String(config.coupon_discount_percent))
                    .replace(/\{cupom\}/g, couponCode)
                    .replace(/\{validade\}/g, String(config.coupon_duration_days));

                  const emailResult = await sendEmail(emailConfig, {
                    to: customer.email,
                    subject: emailSubject,
                    text: emailBody,
                  });

                  if (emailResult.success) {
                    sent = true;
                    log.info(`[BIRTHDAY] ✅ Email sent to ${customer.name} (${customer.email})`);
                  } else {
                    log.error(`[BIRTHDAY] Email failed for ${customer.name}: ${emailResult.error}`);
                  }
                }
              } catch (emailErr) {
                log.error(`[BIRTHDAY] Email error for ${customer.name}:`, emailErr instanceof Error ? emailErr.message : emailErr);
              }
            }

            // Deduct tokens ONLY when message was actually sent
            if (sent) {
              await supabase.rpc('deduct_tokens', {
                _tenant_id: tenantId,
                _amount: BIRTHDAY_TOKEN_COST,
                _type: 'automation',
                _description: `Aniversário - ${customer.name} - Cupom ${couponCode}`,
                _reference_id: config.id,
              });
            }

            await supabase.from('birthday_executions').insert({
              tenant_id: tenantId,
              config_id: config.id,
              customer_name: customer.name,
              customer_phone: customer.phone,
              customer_email: customer.email,
              customer_source: customer.source,
              coupon_code: couponCode,
              action_type: 'birthday_message',
              status: sent ? 'sent' : (errorMsg ? 'failed' : 'pending'),
              error_message: errorMsg,
              tokens_used: sent ? BIRTHDAY_TOKEN_COST : 0,
              metadata: {
                discount_percent: config.coupon_discount_percent,
                duration_days: config.coupon_duration_days,
              },
            });

            totalProcessed++;
          } catch (custError: unknown) {
            const msg = custError instanceof Error ? custError.message : 'Unknown error';
            log.error(`[BIRTHDAY] Error processing ${customer.name}:`, msg);
            
            await supabase.from('birthday_executions').insert({
              tenant_id: tenantId,
              config_id: config.id,
              customer_name: customer.name,
              customer_phone: customer.phone,
              customer_email: customer.email,
              customer_source: customer.source,
              action_type: 'birthday_message',
              status: 'failed',
              error_message: msg,
            });
          }
        }
      } catch (configError: unknown) {
        const msg = configError instanceof Error ? configError.message : 'Unknown error';
        log.error(`[BIRTHDAY] Error processing config ${config.id}:`, msg);
      }
    }

    log.info(`[BIRTHDAY] Done. Processed ${totalProcessed} birthday customer(s).`);

    return new Response(JSON.stringify({ success: true, processed: totalProcessed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BIRTHDAY] Fatal error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
