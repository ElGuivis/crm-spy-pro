import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { issueCoupon } from "../_shared/coupon-issuer.ts";
import { canContact, recordTouches } from "../_shared/contact-policy.ts";
import { unsubscribeFor } from "../_shared/email-unsubscribe-link.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";
import { brtParts, brtDateAfter, brtDayStartIso, birthMonthDay, inSendWindow } from "../_shared/brt.ts";
import { paceQuota, pauseBetweenSends } from "../_shared/send-pacing.ts";
import { isAmbiguousSendError, isPermanentRecipientError } from "../_shared/outbound-errors.ts";
import { buildBirthdaySpec, birthdayVars, fillBirthday } from "../_shared/birthday-coupon.ts";

const MAX_FAILED_ATTEMPTS_PER_DAY = 3;
const RUN_BUDGET_MS = 110_000; // o runtime derruba a chamada perto de 150 s

const BIRTHDAY_TOKEN_COST = 3;
const PAGE_SIZE = 1000;

interface BirthdayCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  source: 'loja_integrada' | 'bling';
  liCustomerId?: string | null; // id do cliente na loja (cupom pessoal)
}

function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'ANIV';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function liCustomerIdOf(c: { loja_integrada_customer_id?: unknown; raw_json?: unknown }): string | null {
  if (c.loja_integrada_customer_id != null && c.loja_integrada_customer_id !== '') return String(c.loja_integrada_customer_id);
  const raw = typeof c.raw_json === 'string' ? JSON.parse(c.raw_json) : c.raw_json;
  const id = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).id : null;
  return id != null ? String(id) : null;
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
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);
    const runStartedAt = Date.now();

    // mensagem ao cliente só entre 08h e 21h de Brasília (o cron roda de hora em hora; o primeiro disparo do dia é às 08h)
    if (!inSendWindow()) {
      return new Response(JSON.stringify({ success: true, message: 'Fora da janela de envio', processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    // Dia de hoje em Brasília (o runtime roda em UTC: antes disparava às 21h do dia anterior).
    const { month: todayMonth, day: todayDay } = brtParts();
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
              .select('id, name, phone, email, raw_json, loja_integrada_customer_id')
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
              const bd = birthMonthDay(birthDate);
              if (bd && bd.month === todayMonth && bd.day === todayDay) {
                birthdayCustomers.push({
                  name: c.name || 'Cliente',
                  phone: c.phone,
                  email: c.email,
                  source: 'loja_integrada',
                  liCustomerId: liCustomerIdOf(c as Record<string, unknown>),
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
              const bd = birthMonthDay(c.data_nascimento);
              if (bd && bd.month === todayMonth && bd.day === todayDay) {
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
        const todayStart = brtDayStartIso(); // 00:00 de Brasília
        const { data: alreadyProcessed } = await supabase
          .from('birthday_executions')
          .select('customer_phone, customer_email, status, coupon_code, error_message, created_at')
          .eq('config_id', config.id)
          .gte('created_at', todayStart)
          .in('status', ['sent', 'pending', 'failed']);

        const processedKeys = new Set<string>();
        const failedToday = new Map<string, { count: number; coupon: string | null }>();
        for (const e of alreadyProcessed || []) {
          const k = `${e.customer_phone || ''}|${e.customer_email || ''}`;
          if (e.status === 'failed') {
            const prev = failedToday.get(k) ?? { count: 0, coupon: null };
            const final = isPermanentRecipientError(String(e.error_message ?? "")) || isAmbiguousSendError(String(e.error_message ?? "")); // número sem WhatsApp ou envio incerto: não repete
            failedToday.set(k, { count: prev.count + (final ? MAX_FAILED_ATTEMPTS_PER_DAY : 1), coupon: (e.coupon_code as string | null) || prev.coupon });
          } else processedKeys.add(k);
        }
        const lastSentAt = (alreadyProcessed ?? []).reduce<Date | null>((m, e) => { const t = new Date(e.created_at as string); return !m || t > m ? t : m; }, null);
        const vars = birthdayVars(config);

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
        const authHeader = apiKey ? liAuthHeader(apiKey) : null;

        // ritmo: divide quem falta pelas execuções que restam na janela (o dia não sai de uma vez) e deixa intervalo entre as mensagens
        const pending = birthdayCustomers.filter((c) => {
          const k = `${c.phone || ''}|${c.email || ''}`;
          return !processedKeys.has(k) && (failedToday.get(k)?.count ?? 0) < MAX_FAILED_ATTEMPTS_PER_DAY;
        });
        const quota = paceQuota(pending.length, lastSentAt);
        log.info(`[BIRTHDAY] ${pending.length} pendente(s); cota desta execução: ${quota}`);
        if (quota === 0) continue; // ainda não é a hora do próximo envio
        let attempted = 0;

        for (const customer of birthdayCustomers) {
          if (attempted >= quota || Date.now() - runStartedAt > RUN_BUDGET_MS) break;
          const customerKey = `${customer.phone || ''}|${customer.email || ''}`;
          if (processedKeys.has(customerKey)) {
            log.info(`[BIRTHDAY] Already processed ${customer.name} today, skipping`);
            continue;
          }
          const failedInfo = failedToday.get(customerKey);
          if (failedInfo && failedInfo.count >= MAX_FAILED_ATTEMPTS_PER_DAY) {
            log.info(`[BIRTHDAY] ${customer.name}: ${failedInfo.count} falhas hoje, não tenta mais`);
            continue;
          }

          // Check tokens again
          const { data: stillHasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: BIRTHDAY_TOKEN_COST });
          if (!stillHasTokens) {
            log.info(`[BIRTHDAY] Tokens exhausted for tenant ${tenantId}`);
            break;
          }

          try {
            // regra única de contato, por canal: e-mail suprimido ou telefone bloqueado não recebem; sem canal liberado, nem gera cupom
            const dEmail = customer.email && config.email_enabled && config.email_integration_id ? await canContact(supabase, tenantId, { email: customer.email }, 'birthday') : null;
            const dWa = customer.phone && whatsappConfig ? await canContact(supabase, tenantId, { phone: customer.phone }, 'birthday') : null;
            const emailBlocked = !!dEmail && !dEmail.ok;
            const waBlocked = !!dWa && !dWa.ok;
            if ((dEmail || dWa) && (!dEmail || emailBlocked) && (!dWa || waBlocked)) {
              log.info(`[BIRTHDAY] ${customer.name}: todos os canais bloqueados pelas regras de contato, pulando`);
              continue;
            }

            // Cupom: loja integrada pelo emissor único (livro-razão, nova tentativa em 429, código sem colisão);
            // outras lojas seguem só com o código sorteado, como antes.
            attempted++;
            let couponCode = generateCouponCode();
            if (storeType === 'loja_integrada' && authHeader && config.store_integration?.id) {
              const expiresDate = brtDateAfter(config.coupon_duration_days);
              // tentativa anterior de hoje falhou DEPOIS de criar o cupom na loja: reaproveita em vez de criar outro
              let reused: string | null = null;
              if (failedInfo?.coupon) {
                const { data: prevCoupon } = await supabase.from('generated_coupons').select('coupon_code').eq('tenant_id', tenantId).eq('origin_type', 'birthday').eq('coupon_code', failedInfo.coupon).maybeSingle();
                reused = (prevCoupon?.coupon_code as string | undefined) ?? null;
              }
              const issued = reused ? { ok: true as const, code: reused } : await issueCoupon(supabase, {
                tenantId, integrationId: config.store_integration.id, auth: authHeader,
                origin: { type: 'birthday', id: config.id },
                spec: buildBirthdaySpec(config, { validade: expiresDate, descricao: `Aniversário - ${customer.name}`, liCustomerId: customer.liCustomerId }),
                codeFactory: generateCouponCode, recipient: { name: customer.name, email: customer.email, phone: customer.phone },
              });
              if (!issued.ok) {
                log.error(`[BIRTHDAY] Failed to create coupon for ${customer.name}: ${issued.status} - ${issued.error}`);
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
                  error_message: `Coupon creation failed: ${issued.error}`,
                });
                continue;
              }
              couponCode = issued.code;
            }

            // Build message — support both {{...}} and legacy {…} placeholders
            const firstName = customer.name.split(' ')[0];

            const messageBase = (config.message_template || '')
              // Modern {{...}} placeholders
              .replace(/\{\{cliente_nome\}\}/g, customer.name)
              .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
              .replace(/\{\{nome\}\}/g, customer.name)
              .replace(/\{\{primeiro_nome\}\}/g, firstName)
              // Legacy {…} placeholders (backward compatibility)
              .replace(/\{nome\}/g, customer.name)
              .replace(/\{primeiro_nome\}/g, firstName);
            const message = fillBirthday(messageBase, { ...vars, cupom: couponCode, validade: String(config.coupon_duration_days) });

            let sent = false;
            let waSent = false, emailSent = false;
            let errorMsg: string | null = null;

            // Send WhatsApp
            if (whatsappConfig && customer.phone && !waBlocked) {
              const result = await sendWhatsAppMessage(whatsappConfig, customer.phone, message);
              if (result.success) {
                sent = true; waSent = true;
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
            if (config.email_enabled && config.email_integration_id && customer.email && !emailBlocked) {
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

                  const emailBodyBase = (config.email_body || message)
                    .replace(/\{\{cliente_nome\}\}/g, customer.name)
                    .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
                    .replace(/\{nome\}/g, customer.name)
                    .replace(/\{primeiro_nome\}/g, firstName);
                  const emailBody = fillBirthday(emailBodyBase, { ...vars, cupom: couponCode, validade: String(config.coupon_duration_days) });

                  // link de descadastro (obrigatório): quem clicar entra na lista de supressão
                  const unsub = await unsubscribeFor(supabase, supabaseUrl, tenantId, 'birthday', customer.email, customer.name);
                  if (!unsub) log.error(`[BIRTHDAY] não foi possível criar o link de descadastro para ${customer.email}`);
                  const emailResult = await sendEmail(emailConfig, {
                    to: customer.email,
                    subject: emailSubject,
                    text: unsub ? emailBody + unsub.textFooter : emailBody,
                    headers: unsub?.headers,
                  });

                  if (emailResult.success) {
                    sent = true; emailSent = true;
                    log.info(`[BIRTHDAY] ✅ Email sent to ${customer.name} (${customer.email})`);
                  } else {
                    log.error(`[BIRTHDAY] Email failed for ${customer.name}: ${emailResult.error}`);
                  }
                }
              } catch (emailErr) {
                log.error(`[BIRTHDAY] Email error for ${customer.name}:`, emailErr instanceof Error ? emailErr.message : emailErr);
              }
            }

            await recordTouches(supabase, tenantId, [
              ...(waSent ? [{ target: { phone: customer.phone, email: customer.email }, channel: 'whatsapp' as const, purpose: 'birthday' as const, ref: config.id }] : []),
              ...(emailSent ? [{ target: { email: customer.email, phone: customer.phone }, channel: 'email' as const, purpose: 'birthday' as const, ref: config.id }] : []),
            ]);

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
                coupon_type: config.coupon_type, discount_percent: config.coupon_discount_percent, fixed_value: config.coupon_fixed_value,
                cumulative: config.cumulative, personal: config.personal_coupon, min_order: config.min_order_value, max_discount: config.max_discount_value,
                duration_days: config.coupon_duration_days,
              },
            });

            totalProcessed++;
            if (attempted < quota) await pauseBetweenSends(quota);
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
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BIRTHDAY] Fatal error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
