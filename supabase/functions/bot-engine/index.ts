import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import type { AIAgentRecord, ServiceClient } from "../_shared/supabase-types.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { setLog, transitionToHuman, enqueueBotMessage, triggerOutboundProcessing } from "./bot-helpers.ts";
import { lookupOrderRaw, formatLIOrderResponse, formatBlingOrderResponse } from "./order-helpers.ts";

/**
 * Bot Engine - State machine for conversations.
 * Called by whatsapp-webhook after saving inbound message.
 * Determines bot response based on conversation state and ai_agent config.
 * Sends responses via outbound_queue (never directly).
 */

interface BotRequest {
  conversation_id: string;
  message_id: string;
  message_content: string;
  contact_name?: string;
  button_click_id?: string;
  tenant_id?: string;
}

type BotState = {
  stage: 'welcome' | 'menu' | 'order_lookup' | 'order_verify_cpf' | 'wholesale' | 'human' | 'ai';
  context: Record<string, unknown>;
};

let log = createLogger("bot-engine", "init");

serve(async (req) => {

  const cid = getCorrelationId(req);
  log = createLogger("bot-engine", cid);
  setLog(log);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: BotRequest = await req.json();
    const { conversation_id, message_content, contact_name, button_click_id } = payload;

    log.info(`🤖 Bot engine processing: conv=${conversation_id}, msg="${message_content.substring(0, 50)}"`);

    // ── CONCURRENCY GUARD: prevent duplicate bot processing ──
    const { data: lockAcquired } = await supabase.rpc('try_acquire_bot_lock', {
      _conversation_id: conversation_id,
      _lock_seconds: 15,
    });

    if (!lockAcquired) {
      log.info('⏭️ Bot lock NOT acquired — another instance is processing this conversation');
      return new Response(JSON.stringify({ skipped: true, reason: 'bot_locked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let convQuery = supabase
      .from('conversations')
      .select('*, contact:contacts(id, phone, name)')
      .eq('id', conversation_id);

    if (payload.tenant_id) {
      convQuery = convQuery.eq('tenant_id', payload.tenant_id);
    }

    const { data: conversation, error: convErr } = await convQuery.single();

    if (convErr || !conversation) {
      log.error('❌ Conversation not found:', convErr);
      await supabase.rpc('release_bot_lock', { _conversation_id: conversation_id });
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lowerMsgEarly = message_content.toLowerCase().trim();
    const wantsMenuEarly = lowerMsgEarly === 'menu' || lowerMsgEarly === 'voltar' || lowerMsgEarly === '0' || lowerMsgEarly === 'inicio' || lowerMsgEarly === 'início';

    if (conversation.handoff_mode || !conversation.ai_enabled || conversation.status === 'closed') {
      if (wantsMenuEarly && conversation.status !== 'closed') {
        log.info('📋 User requested menu while in handoff/disabled — re-activating bot');
        await supabase.from('conversations').update({
          handoff_mode: false,
          ai_enabled: true,
          bot_state_json: { stage: 'menu', context: {} },
          status: 'open',
        }).eq('id', conversation.id);
        conversation.handoff_mode = false;
        conversation.ai_enabled = true;
        conversation.bot_state_json = { stage: 'menu', context: {} };
      } else {
        log.info('⏭️ Bot skipped: handoff_mode or ai_disabled or closed');
        await supabase.rpc('release_bot_lock', { _conversation_id: conversation_id });
        return new Response(JSON.stringify({ skipped: true, reason: 'handoff_or_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let inboxAgentId: string | null = null;
    if (conversation.inbox_id) {
      const { data: inbox } = await supabase
        .from('inboxes')
        .select('bot_enabled, ai_agent_id')
        .eq('id', conversation.inbox_id)
        .single();
      if (inbox && !inbox.bot_enabled) {
        log.info('⏭️ Bot skipped: inbox bot disabled');
        await supabase.rpc('release_bot_lock', { _conversation_id: conversation_id });
        return new Response(JSON.stringify({ skipped: true, reason: 'inbox_bot_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      inboxAgentId = inbox?.ai_agent_id || null;
    }

    const agentId = conversation.current_ai_agent_id || inboxAgentId;
    let agent: AIAgentRecord | null = null;
    if (agentId) {
      const { data } = await supabase.from('ai_agents').select('id, tenant_id, name, system_prompt, model, temperature, max_tokens, ai_provider, welcome_message, agent_type, is_active, human_transfer_column_id, transfer_keywords, interactive_buttons, data_access, keyword_action_rules, agent_transfer_rules, inactivity_enabled, inactivity_timeout_minutes, inactivity_message, inactivity_target_column_id, order_verification_enabled, order_verification_mode, order_verification_messages, verification_type, after_verified_column_id, cpf_max_attempts_column_id, order_not_found_column_id, store_integration_id, order_details_template, tracking_link_base, message_buffer_enabled, message_buffer_delay_seconds').eq('id', agentId).single();
      agent = data as AIAgentRecord | null;
    }

    const state: BotState = conversation.bot_state_json || { stage: 'welcome', context: {} };
    const lowerMsg = message_content.toLowerCase().trim();

    if (agent?.transfer_keywords?.length) {
      const shouldTransfer = (agent.transfer_keywords as string[]).some((kw) => lowerMsg.includes(kw.toLowerCase()));
      if (shouldTransfer) {
        await transitionToHuman(supabase, conversation, agent as unknown as Record<string, unknown>);
        triggerOutboundProcessing(log);
        return new Response(JSON.stringify({ action: 'transferred_to_human' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (agent?.keyword_action_rules) {
      const rules = agent.keyword_action_rules as Array<{
        keywords: string[];
        action: string;
        target_column_id?: string;
        response?: string;
      }>;
      for (const rule of rules) {
        const matched = rule.keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
        if (matched) {
          if (rule.action === 'transfer_column' && rule.target_column_id) {
            await supabase.from('conversations').update({
              kanban_column_id: rule.target_column_id,
              handoff_mode: true,
              ai_enabled: false,
              status: 'pending',
              bot_locked_until: null,
            }).eq('id', conversation.id);
            if (rule.response) await enqueueBotMessage(supabase, conversation, rule.response);
            return new Response(JSON.stringify({ action: 'keyword_rule_applied', rule: rule.action }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          if (rule.action === 'respond' && rule.response) {
            await enqueueBotMessage(supabase, conversation, rule.response);
            await supabase.rpc('release_bot_lock', { _conversation_id: conversation_id });
            return new Response(JSON.stringify({ action: 'keyword_response' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }

    const hasAI = !!(agent && agent.system_prompt);
    const hasStructuredMenu = !!(agent?.interactive_buttons && Array.isArray(agent.interactive_buttons) && (agent.interactive_buttons as unknown[]).length > 0);

    let response = '';
    const newState = { ...state };

    const menuButtons: Array<{ id: string; text: string; action: string; response?: string }> =
      (agent?.interactive_buttons as Array<{ id: string; text: string; action: string; response?: string }>) || [
        { id: 'track', text: '📦 Rastrear pedido', action: 'order_lookup' },
        { id: 'wholesale', text: '🏪 Atacado', action: 'respond', response: '🏪 Para atacado, informe:\n1. Nome da empresa\n2. CNPJ\n3. Produtos de interesse' },
        { id: 'human', text: '👤 Falar com atendente', action: 'transfer_human' },
      ];

    const buildWelcomeMessage = (name: string) => agent?.welcome_message || `Olá ${name}! 👋 Como posso ajudar?`;
    const buildMenuOnlyText = () => menuButtons.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n');

    const findSelectedButton = () => {
      for (let i = 0; i < menuButtons.length; i++) {
        const btn = menuButtons[i];
        if (button_click_id === btn.id) return btn;
        if (lowerMsg === String(i + 1)) return btn;
        if (btn.text && lowerMsg.includes(btn.text.replace(/[^\w\s]/g, '').toLowerCase().trim())) return btn;
      }
      return null;
    };

    const wantsMenu = lowerMsg === 'menu' || lowerMsg === 'voltar' || lowerMsg === '0' || lowerMsg === 'inicio' || lowerMsg === 'início';

    if (wantsMenu && state.stage !== 'welcome') {
      log.info(`📋 User requested menu (stage was: ${state.stage}) — returning to bot menu (no welcome)`);
      newState.stage = 'menu';
      newState.context = {};
      const menuOnly = buildMenuOnlyText();
      await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
      if (menuOnly) {
        await enqueueBotMessage(supabase, conversation, menuOnly);
        triggerOutboundProcessing(log);
      }
      return new Response(JSON.stringify({ success: true, stage: newState.stage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (state.stage) {
      case 'welcome':
      case 'menu': {
        if (state.stage === 'welcome') {
          const name = contact_name || conversation.contact?.name || 'cliente';
          const welcomeMsg = buildWelcomeMessage(name);
          const menuOnly = buildMenuOnlyText();
          log.info('👋 First interaction detected — sending welcome message before menu');
          await enqueueBotMessage(supabase, conversation, welcomeMsg);
          response = menuOnly;
          newState.stage = 'menu';
          newState.context = {};
          break;
        }

        const selectedBtn = findSelectedButton();
        if (selectedBtn) {
          if (selectedBtn.action === 'order_lookup') {
            newState.stage = 'order_lookup';
            response = '📦 Por favor, informe o número do seu pedido:';
          } else if (selectedBtn.action === 'transfer_human') {
            await transitionToHuman(supabase, conversation, agent as unknown as Record<string, unknown>);
            triggerOutboundProcessing(log);
            return new Response(JSON.stringify({ action: 'transferred_to_human' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else if (selectedBtn.action === 'respond' && selectedBtn.response) {
            response = selectedBtn.response;
          } else if (selectedBtn.action === 'delegate_ai' && hasAI) {
            newState.stage = 'ai';
            log.info('🧠 Menu selection triggered AI delegation (explicit delegate_ai action)');
            await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
            return new Response(JSON.stringify({ action: 'delegate_to_ai', agent_id: agentId }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          if (hasStructuredMenu) {
            log.info('📋 No menu match with structured menu — re-showing menu');
            response = buildMenuOnlyText();
            newState.stage = 'menu';
          } else if (state.stage === 'menu' && hasAI) {
            log.info('🧠 No menu match (pure AI agent), delegating to AI');
            newState.stage = 'ai';
            await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
            return new Response(JSON.stringify({ action: 'delegate_to_ai', agent_id: agentId }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        break;
      }

      case 'ai': {
        if (hasStructuredMenu) {
          log.info('🔄 AI stage but agent has structured menu — returning to menu');
          newState.stage = 'menu';
          response = buildMenuOnlyText();
        } else {
          await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
          return new Response(JSON.stringify({ action: 'delegate_to_ai', agent_id: agentId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case 'order_lookup': {
        const orderNum = message_content.trim();
        if (wantsMenu) {
          newState.stage = 'menu';
          response = buildMenuOnlyText();
        } else {
          const orderResult = await lookupOrderRaw(supabase, conversation.tenant_id, orderNum, agent as unknown as Record<string, unknown>, log);
          if (orderResult) {
            if (agent?.order_verification_enabled) {
              newState.stage = 'order_verify_cpf';
              newState.context = {
                ...newState.context,
                pending_order: orderResult.raw,
                pending_order_source: orderResult.source,
                pending_order_num: orderNum,
                cpf_attempts: 0,
              };
              const verificationMessages = agent.order_verification_messages as Record<string, string> | null;
              response = verificationMessages?.ask_cpf || '🔐 Para sua segurança, informe o CPF vinculado ao pedido:';
            } else {
              response = orderResult.formatted;
            }
          } else {
            if (agent?.order_not_found_column_id) {
              await supabase.from('conversations').update({
                kanban_column_id: agent.order_not_found_column_id,
                handoff_mode: true,
                ai_enabled: false,
                status: 'pending',
              }).eq('id', conversation.id);
            }
            response = `🔍 Não encontrei o pedido *${orderNum}* em nosso sistema.\n\nVerifique o número e tente novamente, ou digite "menu" para voltar.`;
          }
        }
        break;
      }

      case 'order_verify_cpf': {
        if (wantsMenu) {
          newState.stage = 'menu';
          newState.context = {};
          response = buildMenuOnlyText();
        } else {
          const inputCpf = message_content.replace(/\D/g, '').trim();
          const pendingOrder = state.context.pending_order as Record<string, unknown>;
          const orderSource = state.context.pending_order_source as string;
          const cpfAttempts = ((state.context.cpf_attempts as number) || 0) + 1;
          const maxAttempts = 3;

          let orderCpf = '';
          if (orderSource === 'li') {
            const rawJson = pendingOrder?.raw_json as Record<string, unknown> | null;
            const cliente = (rawJson?.cliente || {}) as Record<string, unknown>;
            orderCpf = ((cliente.cpf || cliente.cnpj || '') as string).replace(/\D/g, '');
          } else if (orderSource === 'bling') {
            orderCpf = ((pendingOrder?.cliente_cpf_cnpj || '') as string).replace(/\D/g, '');
          }

          const verificationMessages = agent?.order_verification_messages as Record<string, string> | null;
          const askCpfMsg = verificationMessages?.ask_cpf || '';
          const partialMatch = askCpfMsg.match(/(\d+)\s*primeiro/i);
          const partialDigits = partialMatch ? parseInt(partialMatch[1]) : 0;

          let cpfMatches = false;
          if (inputCpf && orderCpf) {
            if (partialDigits > 0) {
              cpfMatches = orderCpf.startsWith(inputCpf) && inputCpf.length === partialDigits;
            } else {
              cpfMatches = inputCpf === orderCpf;
            }
          }

          if (cpfMatches) {
            let formatted = '';
            if (orderSource === 'li') formatted = formatLIOrderResponse(pendingOrder, agent as unknown as Record<string, unknown>);
            else if (orderSource === 'bling') formatted = formatBlingOrderResponse(pendingOrder, agent as unknown as Record<string, unknown>);

            if (agent?.after_verified_column_id) {
              await supabase.from('conversations').update({ kanban_column_id: agent.after_verified_column_id }).eq('id', conversation.id);
            }
            newState.stage = 'menu';
            newState.context = {};
            const successPrefix = verificationMessages?.cpf_verified || '✅ CPF verificado com sucesso!\n\n';
            response = successPrefix + formatted;
          } else {
            if (cpfAttempts >= maxAttempts) {
              if (agent?.cpf_max_attempts_column_id) {
                await supabase.from('conversations').update({
                  kanban_column_id: agent.cpf_max_attempts_column_id,
                  handoff_mode: true,
                  ai_enabled: false,
                  status: 'pending',
                }).eq('id', conversation.id);
              }
              newState.stage = 'menu';
              newState.context = {};
              response = verificationMessages?.max_attempts || '❌ Número máximo de tentativas excedido. Transferindo para um atendente...';
              await transitionToHuman(supabase, conversation, agent as unknown as Record<string, unknown>, 'cpf_falhou');
              triggerOutboundProcessing(log);
            } else {
              newState.context = { ...state.context, cpf_attempts: cpfAttempts };
              response = verificationMessages?.cpf_invalid || `❌ CPF não confere. Tentativa ${cpfAttempts}/${maxAttempts}. Tente novamente:`;
            }
          }
        }
        break;
      }

      case 'wholesale':
        await transitionToHuman(supabase, conversation, agent as unknown as Record<string, unknown>, 'atacado');
        response = '✅ Informações recebidas! Um atendente especializado entrará em contato em breve.';
        break;

      default:
        response = buildMenuOnlyText();
        newState.stage = 'menu';
    }

    await supabase.from('conversations').update({
      bot_state_json: newState,
      bot_locked_until: null,
    }).eq('id', conversation.id);

    if (response) {
      await enqueueBotMessage(supabase, conversation, response);
      triggerOutboundProcessing(log);
    }

    return new Response(JSON.stringify({ success: true, stage: newState.stage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      const payload: BotRequest = await req.clone().json().catch(() => ({ conversation_id: '' })) as BotRequest;
      if (payload.conversation_id) {
        await sb.rpc('release_bot_lock', { _conversation_id: payload.conversation_id });
      }
    } catch (_) { /* best effort */ }
    log.error('❌ Bot engine error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
