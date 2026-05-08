import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';
const REACTIVATION_TOKEN_COST = 5;
const PAGE_SIZE = 1000;

interface InactiveCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  lastOrderDate: string;
  daysInactive: number;
  source: 'loja_integrada' | 'bling';
}

function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REACT';
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
  const log = createLogger("reactivation-processor", cid);

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

    log.info('[REACTIVATION] Starting reactivation processor...');

    // Get all active reactivation configs
    const { data: configs, error: configsError } = await supabase
      .from('reactivation_configs')
      .select(`
        *,
        whatsapp_integration:integrations!reactivation_configs_whatsapp_integration_id_fkey(id, name, type, status, metadata),
        store_integration:integrations!reactivation_configs_integration_id_fkey(id, name, type, status, api_key)
      `)
      .eq('is_active', true)
      .not('activated_at', 'is', null);

    if (configsError) {
      log.error('[REACTIVATION] Error loading configs:', configsError);
      throw configsError;
    }

    if (!configs || configs.length === 0) {
      log.info('[REACTIVATION] No active reactivation configs found');
      return new Response(JSON.stringify({ success: true, message: 'No active configs', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[REACTIVATION] Found ${configs.length} active config(s)`);

    const now = new Date();
    let totalProcessed = 0;

    for (const config of configs) {
      try {
        const tenantId = config.tenant_id;
        const integrationId = config.integration_id;
        const storeType = config.store_integration?.type;
        const inactivityDays = config.inactivity_days || 30;
        const maxCycles = config.max_cycles || 0; // 0 = unlimited
        const activatedAt = config.activated_at;

        // Load cycle steps for this config
        const { data: cycleSteps } = await supabase
          .from('reactivation_cycle_steps')
          .select('step_number, delay_days, message_template, is_active, use_custom_coupon, coupon_discount_percent, coupon_duration_days')
          .eq('config_id', config.id)
          .eq('is_active', true)
          .order('step_number', { ascending: true });

        // Fallback to legacy single message if no steps configured
        const steps = (cycleSteps && cycleSteps.length > 0)
          ? cycleSteps
          : [{ step_number: 1, delay_days: 0, message_template: config.message_template || '', is_active: true }];
        
        const totalSteps = steps.length;

        log.info(`[REACTIVATION] Processing config ${config.id} for tenant ${tenantId}, store: ${storeType}, inactivity: ${inactivityDays}d`);

        // Check tokens
        const { data: hasTokens } = await supabase.rpc('has_enough_tokens', {
          _tenant_id: tenantId,
          _amount: REACTIVATION_TOKEN_COST,
        });
        if (!hasTokens) {
          log.info(`[REACTIVATION] Tenant ${tenantId} has insufficient tokens`);
          continue;
        }

        // Find inactive customers
        const inactiveCustomers: InactiveCustomer[] = [];
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);

        if (storeType === 'loja_integrada') {
          // LI orders don't have customer_name/phone/email columns directly.
          // Customer data is inside raw_json->'cliente', or we join with li_customers.
          // Strategy: fetch orders with raw_json->cliente fields via li_customers join by customer_id.
          const orders = await fetchAllRows(
            supabase
              .from('li_orders')
              .select('customer_id, created_at_remote, raw_json')
              .eq('integration_id', integrationId)
              .gte('created_at_remote', activatedAt)
              .order('created_at_remote', { ascending: false })
          );

          if (orders.length > 0) {
            // Extract unique customer_ids to batch-fetch customer details
            const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];

            // Fetch customer details from li_customers
            const customerMap = new Map<string, { name: string; phone: string | null; email: string | null }>();

            if (customerIds.length > 0) {
              // Fetch in batches of 500 to avoid query size limits
              for (let i = 0; i < customerIds.length; i += 500) {
                const batch = customerIds.slice(i, i + 500);
                const { data: customers } = await supabase
                  .from('li_customers')
                  .select('loja_integrada_id, name, phone, email')
                  .eq('integration_id', integrationId)
                  .in('loja_integrada_id', batch);

                if (customers) {
                  for (const c of customers) {
                    customerMap.set(String(c.loja_integrada_id), {
                      name: c.name || 'Cliente',
                      phone: c.phone || null,
                      email: c.email || null,
                    });
                  }
                }
              }
            }

            // Group orders by customer, tracking last order date
            const lastOrderMap = new Map<string, { name: string; phone: string | null; email: string | null; lastOrder: string }>();

            for (const o of orders) {
              // Try to get customer info from li_customers first, fallback to raw_json
              let custInfo = o.customer_id ? customerMap.get(String(o.customer_id)) : null;

              if (!custInfo && o.raw_json) {
                const rawJson = typeof o.raw_json === 'string' ? JSON.parse(o.raw_json) : o.raw_json;
                const cliente = rawJson?.cliente;
                if (cliente) {
                  custInfo = {
                    name: cliente.nome || 'Cliente',
                    phone: cliente.telefone_celular || cliente.telefone_principal || null,
                    email: cliente.email || null,
                  };
                }
              }

              if (!custInfo) continue;

              const phone = custInfo.phone ? formatPhoneNumber(custInfo.phone) : null;
              const key = phone || custInfo.email || '';
              if (!key) continue;

              if (!lastOrderMap.has(key)) {
                lastOrderMap.set(key, {
                  name: custInfo.name,
                  phone: custInfo.phone,
                  email: custInfo.email,
                  lastOrder: o.created_at_remote,
                });
              }
              // Already ordered desc, so first occurrence is the latest
            }

            // Filter inactive ones
            for (const [, cust] of lastOrderMap) {
              const lastOrderDate = new Date(cust.lastOrder);
              if (lastOrderDate < cutoffDate) {
                const diffMs = now.getTime() - lastOrderDate.getTime();
                const daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                inactiveCustomers.push({
                  name: cust.name,
                  phone: cust.phone,
                  email: cust.email,
                  lastOrderDate: cust.lastOrder,
                  daysInactive,
                  source: 'loja_integrada',
                });
              }
            }
          }
        } else if (storeType === 'bling') {
          const orders = await fetchAllRows(
            supabase
              .from('bling_orders')
              .select('cliente_nome, cliente_telefone, cliente_email, data_criacao')
              .eq('integration_id', integrationId)
              .gte('data_criacao', activatedAt)
              .order('data_criacao', { ascending: false })
          );

          if (orders.length > 0) {
            const customerMap = new Map<string, { name: string; phone: string | null; email: string | null; lastOrder: string }>();

            for (const o of orders) {
              const phone = o.cliente_telefone ? formatPhoneNumber(o.cliente_telefone) : null;
              const key = phone || o.cliente_email || '';
              if (!key) continue;

              if (!customerMap.has(key)) {
                customerMap.set(key, {
                  name: o.cliente_nome || 'Cliente',
                  phone: o.cliente_telefone,
                  email: o.cliente_email,
                  lastOrder: o.data_criacao,
                });
              }
            }

            for (const [, cust] of customerMap) {
              const lastOrderDate = new Date(cust.lastOrder);
              if (lastOrderDate < cutoffDate) {
                const diffMs = now.getTime() - lastOrderDate.getTime();
                const daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                inactiveCustomers.push({
                  name: cust.name,
                  phone: cust.phone,
                  email: cust.email,
                  lastOrderDate: cust.lastOrder,
                  daysInactive,
                  source: 'bling',
                });
              }
            }
          }
        }

        log.info(`[REACTIVATION] Found ${inactiveCustomers.length} inactive customer(s) for config ${config.id}`);
        if (inactiveCustomers.length === 0) continue;

        // Check deduplication — get existing executions for this config with cycle_step info
        const existingExecs = await fetchAllRows(
          supabase
            .from('reactivation_executions')
            .select('customer_phone, customer_email, created_at, cycle_step')
            .eq('config_id', config.id)
            .in('status', ['sent', 'pending'])
        );

        // Build dedup map: customer key → { count, lastExecDate, lastStep }
        const execMap = new Map<string, { count: number; lastExecDate: Date; lastStep: number }>();
        for (const ex of existingExecs) {
          const phone = ex.customer_phone ? formatPhoneNumber(ex.customer_phone) : null;
          const key = phone || ex.customer_email || '';
          if (!key) continue;
          const execDate = new Date(ex.created_at);
          const existing = execMap.get(key);
          if (!existing) {
            execMap.set(key, { count: 1, lastExecDate: execDate, lastStep: ex.cycle_step || 1 });
          } else {
            existing.count++;
            if (execDate > existing.lastExecDate) {
              existing.lastExecDate = execDate;
              existing.lastStep = ex.cycle_step || 1;
            }
          }
        }

        // Get WhatsApp config
        let whatsappConfig: WhatsAppConfig | null = null;
        if (config.whatsapp_integration_id && evolutionUrl && evolutionApiKey) {
          const metadata = config.whatsapp_integration?.metadata as Record<string, unknown>;
          const instanceName = metadata?.instance_name || metadata?.instanceName;
          if (instanceName) {
            whatsappConfig = {
              evolutionApiUrl: evolutionUrl,
              evolutionApiKey,
              instanceName: instanceName as string,
            };
          }
        }

        // LI coupon auth
        const apiKey = config.store_integration?.api_key;
        const authHeader = apiKey ? `chave_api ${apiKey} aplicacao ${appKey}` : null;

        for (const customer of inactiveCustomers) {
          const phone = customer.phone ? formatPhoneNumber(customer.phone) : null;
          const customerKey = phone || customer.email || '';
          if (!customerKey) continue;

          // Determine which cycle step this customer is on
          const customerExec = execMap.get(customerKey);
          let nextStepIndex = 0;
          
          if (customerExec) {
            // Max cycles check: if maxCycles > 0 and customer already reached it, skip
            if (maxCycles > 0 && customerExec.count >= maxCycles) {
              log.info(`[REACTIVATION] Customer ${customer.name} reached max ${maxCycles} cycles, skipping`);
              continue;
            }

            // Find the next step to send
            const nextStepNumber = customerExec.lastStep + 1;
            nextStepIndex = steps.findIndex(s => s.step_number === nextStepNumber);
            
            // If no more steps, loop back to first (if not limited by maxCycles)
            if (nextStepIndex === -1) {
              nextStepIndex = 0; // restart cycle
            }

            // Check delay: days since last execution must be >= this step's delay_days
            const currentStep = steps[nextStepIndex];
            const daysSinceExec = Math.floor((now.getTime() - customerExec.lastExecDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceExec < currentStep.delay_days) {
              continue; // Not time yet for next step
            }
          }

          // Check tokens again
          const { data: stillHasTokens } = await supabase.rpc('has_enough_tokens', {
            _tenant_id: tenantId,
            _amount: REACTIVATION_TOKEN_COST,
          });
          if (!stillHasTokens) {
            log.info(`[REACTIVATION] Tokens exhausted for tenant ${tenantId}`);
            break;
          }

          try {
            // Get the current step's settings
            const currentStep = steps[nextStepIndex];
            
            // Determine coupon settings: step-specific or global
            const stepDiscount = currentStep.use_custom_coupon && currentStep.coupon_discount_percent != null
              ? currentStep.coupon_discount_percent
              : config.coupon_discount_percent;
            const stepDuration = currentStep.use_custom_coupon && currentStep.coupon_duration_days != null
              ? currentStep.coupon_duration_days
              : config.coupon_duration_days;

            // Generate coupon
            const couponCode = generateCouponCode();

            // Create coupon in LI
            if (storeType === 'loja_integrada' && authHeader) {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + stepDuration);

              const couponPayload = {
                codigo: couponCode,
                tipo: 'porcentagem',
                valor: stepDiscount,
                validade: expiresAt.toISOString().split('T')[0],
                quantidade: 1,
                quantidade_por_cliente: 1,
                ativo: true,
                aplicar_no_frete: false,
                descricao: `Reativação - ${customer.name} - Ciclo ${currentStep.step_number}`,
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
                log.error(`[REACTIVATION] Failed to create coupon for ${customer.name}: ${response.status} - ${errorText}`);

                await supabase.from('reactivation_executions').insert({
                  tenant_id: tenantId,
                  config_id: config.id,
                  customer_name: customer.name,
                  customer_phone: customer.phone,
                  customer_email: customer.email,
                  coupon_code: couponCode,
                  last_order_date: customer.lastOrderDate,
                  days_inactive: customer.daysInactive,
                  status: 'failed',
                  error_message: `Coupon creation failed: ${errorText}`,
                });
                continue;
              }

              await response.json();
            }

            // Get the current step's message template
            const currentStep = steps[nextStepIndex];
            const currentStepNumber = currentStep.step_number;
            
            // Build message from step-specific template
            const firstName = customer.name.split(' ')[0];

            const message = (currentStep.message_template || config.message_template || '')
              .replace(/\{\{cliente_nome\}\}/g, customer.name)
              .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
              .replace(/\{\{desconto\}\}/g, String(stepDiscount))
              .replace(/\{\{cupom\}\}/g, couponCode)
              .replace(/\{\{validade\}\}/g, String(stepDuration))
              .replace(/\{\{dias_inativo\}\}/g, String(customer.daysInactive))
              .replace(/\{\{ciclo\}\}/g, String(customerExec ? customerExec.count + 1 : 1))
              // Legacy placeholders compatibility
              .replace(/\{nome\}/g, customer.name)
              .replace(/\{primeiro_nome\}/g, firstName)
              .replace(/\{desconto\}/g, String(stepDiscount))
              .replace(/\{cupom\}/g, couponCode)
              .replace(/\{dias\}/g, String(stepDuration));

            let sent = false;
            let errorMsg: string | null = null;

            // Send WhatsApp
            if (whatsappConfig && customer.phone) {
              const result = await sendWhatsAppMessage(whatsappConfig, customer.phone, message);
              if (result.success) {
                sent = true;
                log.info(`[REACTIVATION] ✅ WhatsApp sent to ${customer.name} (step ${currentStepNumber}, inactive ${customer.daysInactive}d)`);

                // Create automation conversation
                if (config.whatsapp_integration_id) {
                  try {
                    await ensureAutomationConversation({
                      supabase,
                      tenantId,
                      customerPhone: customer.phone,
                      integrationId: config.whatsapp_integration_id,
                      messageContent: message,
                      automationType: 'reactivation',
                      metadata: { customer_name: customer.name },
                    });
                  } catch (autoConvErr) {
                    log.error('[REACTIVATION] Failed to create automation conversation:', autoConvErr);
                  }
                }
              } else {
                errorMsg = result.error || 'WhatsApp send failed';
                log.error(`[REACTIVATION] WhatsApp failed for ${customer.name}: ${errorMsg}`);
              }
            }

            // Deduct tokens ONLY when message was actually sent
            if (sent) {
              await supabase.rpc('deduct_tokens', {
                _tenant_id: tenantId,
                _amount: REACTIVATION_TOKEN_COST,
                _type: 'automation',
                _description: `Reativação - ${customer.name} - Ciclo ${currentStepNumber} - Cupom ${couponCode}`,
                _reference_id: config.id,
              });
            }

            // Log execution with cycle_step
            await supabase.from('reactivation_executions').insert({
              tenant_id: tenantId,
              config_id: config.id,
              customer_name: customer.name,
              customer_phone: customer.phone,
              customer_email: customer.email,
              coupon_code: couponCode,
              last_order_date: customer.lastOrderDate,
              days_inactive: customer.daysInactive,
              cycle_step: currentStepNumber,
              status: sent ? 'sent' : (errorMsg ? 'failed' : 'pending'),
              error_message: errorMsg,
              tokens_used: sent ? REACTIVATION_TOKEN_COST : 0,
            });

            totalProcessed++;
          } catch (custError: unknown) {
            const msg = custError instanceof Error ? custError.message : 'Unknown error';
            log.error(`[REACTIVATION] Error processing ${customer.name}:`, msg);

            await supabase.from('reactivation_executions').insert({
              tenant_id: tenantId,
              config_id: config.id,
              customer_name: customer.name,
              customer_phone: customer.phone,
              customer_email: customer.email,
              last_order_date: customer.lastOrderDate,
              days_inactive: customer.daysInactive,
              status: 'failed',
              error_message: msg,
            });
          }
        }
      } catch (configError: unknown) {
        const msg = configError instanceof Error ? configError.message : 'Unknown error';
        log.error(`[REACTIVATION] Error processing config ${config.id}:`, msg);
      }
    }

    log.info(`[REACTIVATION] Done. Processed ${totalProcessed} inactive customer(s).`);

    return new Response(JSON.stringify({ success: true, processed: totalProcessed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[REACTIVATION] Fatal error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
