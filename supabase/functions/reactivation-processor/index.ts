import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWhatsAppMessage, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { issueCoupon } from "../_shared/coupon-issuer.ts";
import { canContact, normPhone, recordTouches } from "../_shared/contact-policy.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { ensureAutomationConversation } from "../_shared/automation-conversation.ts";
import { fetchAllRows, generateCouponCode, type InactiveCustomer } from "./helpers.ts";
import { customerKey, decideNext, type ExecRow } from "./state.ts";
import { isAmbiguousSendError, isPermanentRecipientError } from "../_shared/outbound-errors.ts";
import { findInactiveCustomers } from "./inactive-customers.ts";
import { brtDateAfter, brtDayStartIso, inSendWindow } from "../_shared/brt.ts";
import { paceQuota, pauseBetweenSends } from "../_shared/send-pacing.ts";

const RUN_BUDGET_MS = 110_000; // o runtime derruba a chamada perto de 150 s

const REACTIVATION_TOKEN_COST = 5;

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

    // mensagem ao cliente só entre 08h e 21h de Brasília; o cron roda de hora em hora e cada execução envia só a sua parte do dia
    if (!inSendWindow()) {
      return new Response(JSON.stringify({ success: true, message: 'Fora da janela de envio', processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const runStartedAt = Date.now();
    const dayStart = new Date(brtDayStartIso());
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
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - inactivityDays);
        const inactiveCustomers = await findInactiveCustomers(supabase, storeType, integrationId, activatedAt, cutoffDate, now);

        log.info(`[REACTIVATION] Found ${inactiveCustomers.length} inactive customer(s) for config ${config.id}`);
        if (inactiveCustomers.length === 0) continue;

        // Sem WhatsApp conectado não há o que enviar: antes o processador gerava cupom e gravava "pending" para cada cliente,
        // gastando os passos do ciclo sem mandar nada.
        if (config.whatsapp_integration?.status !== 'connected') {
          log.warn(`[REACTIVATION] Config ${config.id}: WhatsApp desconectado ou não configurado; nada enviado`);
          continue;
        }
        let whatsappConfig: WhatsAppConfig | null = null;
        if (evolutionUrl && evolutionApiKey) {
          const metadata = config.whatsapp_integration?.metadata as Record<string, unknown>;
          const instanceName = metadata?.instance_name || metadata?.instanceName;
          if (instanceName) whatsappConfig = { evolutionApiUrl: evolutionUrl, evolutionApiKey, instanceName: instanceName as string };
        }
        if (!whatsappConfig) { log.warn(`[REACTIVATION] Config ${config.id}: instância do WhatsApp não encontrada`); continue; }

        // Histórico da configuração (todas as situações), agrupado por pessoa
        const history = await fetchAllRows(
          supabase.from('reactivation_executions').select('customer_key, created_at, cycle_step, last_order_date, status, attempt_no').eq('config_id', config.id)
        ) as (ExecRow & { customer_key: string | null })[];
        const rowsByKey = new Map<string, ExecRow[]>();
        for (const r of history) {
          if (!r.customer_key) continue;
          rowsByKey.set(r.customer_key, [...(rowsByKey.get(r.customer_key) ?? []), r]);
        }

        // Quem pode receber agora: tem telefone válido e o ciclo dele permite (passo, espera, limite, episódio)
        const eligible: { customer: InactiveCustomer; key: string; stepIndex: number; attemptNo: number }[] = [];
        for (const customer of inactiveCustomers) {
          if (!normPhone(customer.phone)) continue; // a reativação é por WhatsApp
          const key = customerKey(customer.phone, customer.email);
          const d = decideNext({ rows: rowsByKey.get(key) ?? [], steps, maxCycles, inactivityDays, resendIntervalDays: config.resend_interval_days || 0, lastOrderDate: customer.lastOrderDate, now });
          if (d.send) eligible.push({ customer, key, stepIndex: d.stepIndex, attemptNo: d.attemptNo });
        }

        // ritmo: divide quem ainda pode receber pelas execuções que restam na janela
        const lastSentAt = history.reduce<Date | null>((m, r) => {
          const d = new Date(r.created_at);
          return d >= dayStart && (r.status === 'sent' || r.status === 'pending') && (!m || d > m) ? d : m;
        }, null);
        const quota = paceQuota(eligible.length, lastSentAt);
        log.info(`[REACTIVATION] ${eligible.length} elegível(is); cota desta execução: ${quota}`);
        if (quota === 0) continue; // ainda não é a hora do próximo envio
        let attempted = 0;
        let transientFailures = 0;

        // LI coupon auth
        const apiKey = config.store_integration?.api_key;
        const authHeader = apiKey ? liAuthHeader(apiKey) : null;

        for (const { customer, key, stepIndex, attemptNo } of eligible) {
          if (attempted >= quota || Date.now() - runStartedAt > RUN_BUDGET_MS) break;
          if (transientFailures >= 3) { log.warn(`[REACTIVATION] 3 falhas seguidas (provedor/loja fora do ar?): parando esta rodada; os clientes continuam elegíveis`); break; }

          const { data: stillHasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: REACTIVATION_TOKEN_COST });
          if (!stillHasTokens) { log.info(`[REACTIVATION] Tokens exhausted for tenant ${tenantId}`); break; }

          const currentStep = steps[stepIndex];
          const stepDiscount = currentStep.use_custom_coupon && currentStep.coupon_discount_percent != null ? currentStep.coupon_discount_percent : config.coupon_discount_percent;
          const stepDuration = currentStep.use_custom_coupon && currentStep.coupon_duration_days != null ? currentStep.coupon_duration_days : config.coupon_duration_days;

          // regra única de contato: telefone bloqueado => não gera cupom (a pessoa continua elegível nas próximas rodadas)
          const rule = await canContact(supabase, tenantId, { phone: customer.phone, email: customer.email }, 'reactivation');
          if (!rule.ok) { log.info(`[REACTIVATION] ${customer.name}: pulado pelas regras de contato (${rule.reason})`); continue; }

          // RESERVA antes de qualquer cupom ou envio: o índice único (config, pessoa, compra, tentativa) impede que duas execuções
          // mandem a mesma mensagem; se o processo cair no meio, a reserva fica e o cliente NÃO recebe de novo.
          const { data: claimed, error: claimErr } = await supabase.from('reactivation_executions').insert({
            tenant_id: tenantId, config_id: config.id, customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email,
            last_order_date: customer.lastOrderDate, days_inactive: customer.daysInactive, cycle_step: currentStep.step_number,
            customer_key: key, attempt_no: attemptNo, status: 'pending', tokens_used: 0,
          }).select('id').single();
          if (claimErr) { if (claimErr.code !== '23505') log.error(`[REACTIVATION] não reservou ${customer.name}:`, claimErr.message); continue; }
          const execId = (claimed as { id: string }).id;
          const release = () => supabase.from('reactivation_executions').delete().eq('id', execId); // volta a ser elegível na próxima rodada
          attempted++;

          try {
            // Cupom: loja integrada pelo emissor único (livro-razão, nova tentativa em 429, código sem colisão); outras lojas, só o código sorteado.
            let couponCode = generateCouponCode();
            if (storeType === 'loja_integrada' && authHeader && config.store_integration?.id) {
              const issued = await issueCoupon(supabase, {
                tenantId, integrationId: config.store_integration.id, auth: authHeader,
                origin: { type: 'reactivation', id: config.id, ref: `ciclo ${currentStep.step_number}` },
                spec: { tipo: 'porcentagem', valor: stepDiscount, validade: brtDateAfter(stepDuration), quantidade: 1, quantidadePorCliente: 1, descricao: `Reativação - ${customer.name} - Ciclo ${currentStep.step_number}` },
                codeFactory: generateCouponCode, recipient: { name: customer.name, email: customer.email, phone: customer.phone },
              });
              if (!issued.ok) {
                log.error(`[REACTIVATION] Failed to create coupon for ${customer.name}: ${issued.status} - ${issued.error}`);
                await release(); transientFailures++;
                continue;
              }
              couponCode = issued.code;
            }
            await supabase.from('reactivation_executions').update({ coupon_code: couponCode }).eq('id', execId);

            const firstName = customer.name.split(' ')[0];
            const message = (currentStep.message_template || config.message_template || '')
              .replace(/\{\{cliente_nome\}\}/g, customer.name)
              .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
              .replace(/\{\{desconto\}\}/g, String(stepDiscount))
              .replace(/\{\{cupom\}\}/g, couponCode)
              .replace(/\{\{validade\}\}/g, String(stepDuration))
              .replace(/\{\{dias_inativo\}\}/g, String(customer.daysInactive))
              .replace(/\{\{ciclo\}\}/g, String(attemptNo))
              // Legacy placeholders compatibility
              .replace(/\{nome\}/g, customer.name).replace(/\{primeiro_nome\}/g, firstName)
              .replace(/\{desconto\}/g, String(stepDiscount)).replace(/\{cupom\}/g, couponCode).replace(/\{dias\}/g, String(stepDuration));

            const result = await sendWhatsAppMessage(whatsappConfig, customer.phone!, message);
            if (!result.success) {
              const err = result.error || 'WhatsApp send failed';
              log.error(`[REACTIVATION] WhatsApp failed for ${customer.name}: ${err}`);
              if (isPermanentRecipientError(err)) {
                // número sem WhatsApp: não adianta repetir (nem neste passo nem nos próximos)
                await supabase.from('reactivation_executions').update({ status: 'unreachable', error_message: err }).eq('id', execId);
              } else if (isAmbiguousSendError(err)) {
                // tempo esgotado: pode ter saído; repetir duplicaria. Fica registrado e o ciclo segue
                await supabase.from('reactivation_executions').update({ status: 'failed', error_message: `Envio não confirmado: ${err}` }).eq('id', execId);
              } else {
                await release(); transientFailures++; // falha do provedor: tenta de novo na próxima rodada
              }
              continue;
            }

            transientFailures = 0;
            log.info(`[REACTIVATION] ✅ WhatsApp sent to ${customer.name} (step ${currentStep.step_number}, tentativa ${attemptNo}, inactive ${customer.daysInactive}d)`);
            await supabase.from('reactivation_executions').update({ status: 'sent', tokens_used: REACTIVATION_TOKEN_COST }).eq('id', execId);
            try {
              await ensureAutomationConversation({ supabase, tenantId, customerPhone: customer.phone!, integrationId: config.whatsapp_integration_id, messageContent: message, automationType: 'reactivation', metadata: { customer_name: customer.name } });
            } catch (autoConvErr) {
              log.error('[REACTIVATION] Failed to create automation conversation:', autoConvErr);
            }
            await recordTouches(supabase, tenantId, [{ target: { phone: customer.phone, email: customer.email }, channel: 'whatsapp', purpose: 'reactivation', ref: config.id }]);
            await supabase.rpc('deduct_tokens', {
              _tenant_id: tenantId, _amount: REACTIVATION_TOKEN_COST, _type: 'automation',
              _description: `Reativação - ${customer.name} - Passo ${currentStep.step_number} - Cupom ${couponCode}`, _reference_id: config.id,
            });
            totalProcessed++;
            if (attempted < quota) await pauseBetweenSends(quota);
          } catch (custError: unknown) {
            const msg = custError instanceof Error ? custError.message : 'Unknown error';
            log.error(`[REACTIVATION] Error processing ${customer.name}:`, msg);
            // erro inesperado antes de saber se saiu: mantém a reserva como falha (não repete às cegas) e segue
            await supabase.from('reactivation_executions').update({ status: 'failed', error_message: msg }).eq('id', execId).eq('status', 'pending');
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
