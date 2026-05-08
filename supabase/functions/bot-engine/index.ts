import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import type { AIAgentRecord, ServiceClient } from "../_shared/supabase-types.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

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
  tenant_id?: string; // Optional tenant scoping for defense-in-depth
}

type BotState = {
  stage: 'welcome' | 'menu' | 'order_lookup' | 'order_verify_cpf' | 'wholesale' | 'human' | 'ai';
  context: Record<string, unknown>;
};

// Module-level log — updated per-request so helper functions can use it
let log = createLogger("bot-engine", "init");

serve(async (req) => {

  const cid = getCorrelationId(req);
  log = createLogger("bot-engine", cid);
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

    // Fetch conversation with inbox — defense-in-depth: also scope by tenant if provided
    let convQuery = supabase
      .from('conversations')
      .select('*, contact:contacts(id, phone, name)')
      .eq('id', conversation_id);

    // If caller provided tenant_id, enforce it even for internal calls
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

    // Check if bot should respond
    const lowerMsgEarly = message_content.toLowerCase().trim();
    const wantsMenuEarly = lowerMsgEarly === 'menu' || lowerMsgEarly === 'voltar' || lowerMsgEarly === '0' || lowerMsgEarly === 'inicio' || lowerMsgEarly === 'início';

    if (conversation.handoff_mode || !conversation.ai_enabled || conversation.status === 'closed') {
      // If user explicitly wants menu, re-activate the bot instead of skipping
      if (wantsMenuEarly && conversation.status !== 'closed') {
        log.info('📋 User requested menu while in handoff/disabled — re-activating bot');
        await supabase.from('conversations').update({
          handoff_mode: false,
          ai_enabled: true,
          bot_state_json: { stage: 'menu', context: {} },
          status: 'open',
        }).eq('id', conversation.id);
        // Update local conversation object for rest of the flow
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

    // Check inbox bot_enabled and get linked ai_agent_id
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

    // Get AI agent: prefer conversation's current agent, then inbox's linked agent
    const agentId = conversation.current_ai_agent_id || inboxAgentId;
    let agent: AIAgentRecord | null = null;
    if (agentId) {
      const { data } = await supabase.from('ai_agents').select('id, tenant_id, name, system_prompt, model, temperature, max_tokens, ai_provider, welcome_message, agent_type, is_active, human_transfer_column_id, transfer_keywords, interactive_buttons, data_access, keyword_action_rules, agent_transfer_rules, inactivity_enabled, inactivity_timeout_minutes, inactivity_message, inactivity_target_column_id, order_verification_enabled, order_verification_mode, order_verification_messages, verification_type, after_verified_column_id, cpf_max_attempts_column_id, order_not_found_column_id, store_integration_id, order_details_template, tracking_link_base, message_buffer_enabled, message_buffer_delay_seconds').eq('id', agentId).single();
      agent = data as AIAgentRecord | null;
    }

    // Parse current state
    const state: BotState = conversation.bot_state_json || { stage: 'welcome', context: {} };
    const lowerMsg = message_content.toLowerCase().trim();

    // Check transfer keywords
    if (agent?.transfer_keywords?.length) {
      const shouldTransfer = agent.transfer_keywords.some((kw: string) =>
        lowerMsg.includes(kw.toLowerCase())
      );
      if (shouldTransfer) {
         await transitionToHuman(supabase, conversation, agent);
         triggerOutboundProcessing();
         return new Response(JSON.stringify({ action: 'transferred_to_human' }), {
           headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         });
      }
    }

    // Check keyword_action_rules
    if (agent?.keyword_action_rules) {
      const rules = agent.keyword_action_rules as Array<{
        keywords: string[];
        action: string;
        target_column_id?: string;
        response?: string;
      }>;
      for (const rule of rules) {
        const matched = rule.keywords.some((kw: string) => lowerMsg.includes(kw.toLowerCase()));
        if (matched) {
          if (rule.action === 'transfer_column' && rule.target_column_id) {
            await supabase.from('conversations').update({
              kanban_column_id: rule.target_column_id,
              handoff_mode: true,
              ai_enabled: false,
              status: 'pending',
              bot_locked_until: null,
            }).eq('id', conversation.id);
            if (rule.response) {
              await enqueueBotMessage(supabase, conversation, rule.response);
            }
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

    // Flag: agent has AI capability (system_prompt)
    const hasAI = !!(agent && agent.system_prompt);

    // Flag: agent has a structured menu (interactive_buttons configured)
    // If the agent has buttons, we NEVER leave the bot flow to raw AI — only delegate_ai action triggers AI
    const hasStructuredMenu = !!(agent?.interactive_buttons && Array.isArray(agent.interactive_buttons) && agent.interactive_buttons.length > 0);

    // State machine for all agents
    let response = '';
    const newState = { ...state };

    // Build dynamic menu from agent's interactive_buttons
    const menuButtons: Array<{ id: string; text: string; action: string; response?: string }> = 
      agent?.interactive_buttons || [
        { id: 'track', text: '📦 Rastrear pedido', action: 'order_lookup' },
        { id: 'wholesale', text: '🏪 Atacado', action: 'respond', response: '🏪 Para atacado, informe:\n1. Nome da empresa\n2. CNPJ\n3. Produtos de interesse' },
        { id: 'human', text: '👤 Falar com atendente', action: 'transfer_human' },
      ];

    const buildWelcomeMessage = (name: string) => {
      return agent?.welcome_message || `Olá ${name}! 👋 Como posso ajudar?`;
    };

    const buildMenuOnlyText = () => {
      return menuButtons.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n');
    };

    // Find which button was selected (by number, keyword, or button_click_id)
    const findSelectedButton = () => {
      for (let i = 0; i < menuButtons.length; i++) {
        const btn = menuButtons[i];
        if (button_click_id === btn.id) return btn;
        if (lowerMsg === String(i + 1)) return btn;
        if (btn.text && lowerMsg.includes(btn.text.replace(/[^\w\s]/g, '').toLowerCase().trim())) return btn;
      }
      return null;
    };

    // Check if user wants to go back to menu (works in ALL stages)
    const wantsMenu = lowerMsg === 'menu' || lowerMsg === 'voltar' || lowerMsg === '0' || lowerMsg === 'inicio' || lowerMsg === 'início';

    // GLOBAL: If user types "menu"/"voltar"/"0" in ANY stage (including ai, order_lookup, etc.),
    // always return to the bot menu — never stay in AI free-roam
    if (wantsMenu && state.stage !== 'welcome') {
      log.info(`📋 User requested menu (stage was: ${state.stage}) — returning to bot menu (no welcome)`);
      newState.stage = 'menu';
      newState.context = {};
      // Only send menu options, NO welcome message
      const menuOnly = buildMenuOnlyText();
      await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
      if (menuOnly) {
        await enqueueBotMessage(supabase, conversation, menuOnly);
        triggerOutboundProcessing();
      }
      return new Response(JSON.stringify({ success: true, stage: newState.stage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (state.stage) {
      case 'welcome':
      case 'menu': {
        // Regra de negócio: primeira interação SEMPRE envia boas-vindas + menu,
        // independentemente do conteúdo recebido.
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
             await transitionToHuman(supabase, conversation, agent);
             triggerOutboundProcessing();
             return new Response(JSON.stringify({ action: 'transferred_to_human' }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
             });
          } else if (selectedBtn.action === 'respond' && selectedBtn.response) {
            response = selectedBtn.response;
          } else if (selectedBtn.action === 'delegate_ai' && hasAI) {
            // Only transition to AI if explicitly configured as a button action
            newState.stage = 'ai';
            log.info('🧠 Menu selection triggered AI delegation (explicit delegate_ai action)');
            await supabase.from('conversations').update({ bot_state_json: newState, bot_locked_until: null }).eq('id', conversation.id);
            return new Response(JSON.stringify({ action: 'delegate_to_ai', agent_id: agentId }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // No button matched
          if (hasStructuredMenu) {
            // Agent has a configured menu — NEVER delegate to AI, always re-show the menu
            log.info('📋 No menu match with structured menu — re-showing menu');
            response = buildMenuOnlyText();
            newState.stage = 'menu';
          } else if (state.stage === 'menu' && hasAI) {
            // Pure AI agent (no interactive_buttons) — delegate to AI
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
        // In AI mode — wantsMenu is already handled above globally
        // If we reach here, it means the user is not asking for menu → stay in AI
        if (hasStructuredMenu) {
          // Agent has structured menu — AI mode should never persist; redirect to menu
          log.info('🔄 AI stage but agent has structured menu — returning to menu');
          newState.stage = 'menu';
          response = buildMenuOnlyText();
        } else {
          // Pure AI agent — stay in AI mode
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
          // Search for the order in the database
          const orderResult = await lookupOrderRaw(supabase, conversation.tenant_id, orderNum, agent);
          if (orderResult) {
            // Check if CPF verification is enabled
            if (agent?.order_verification_enabled) {
              // Store order data in context and ask for CPF
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
              // No verification needed, show order directly
              response = orderResult.formatted;
            }
          } else {
            // Order not found - check if should transfer to column
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

          // Get the CPF from the order
          let orderCpf = '';
          if (orderSource === 'li') {
            // Loja Integrada: CPF is in raw_json.cliente.cpf
            const cliente = pendingOrder?.raw_json?.cliente || {};
            orderCpf = (cliente.cpf || cliente.cnpj || '').replace(/\D/g, '');
          } else if (orderSource === 'bling') {
            orderCpf = (pendingOrder?.cliente_cpf_cnpj || '').replace(/\D/g, '');
          }

          const verificationMessages = agent?.order_verification_messages as Record<string, string> | null;

          // Determine comparison mode: partial (first N digits) or full CPF
          const askCpfMsg = verificationMessages?.ask_cpf || '';
          const partialMatch = askCpfMsg.match(/(\d+)\s*primeiro/i);
          const partialDigits = partialMatch ? parseInt(partialMatch[1]) : 0;
          
          let cpfMatches = false;
          if (inputCpf && orderCpf) {
            if (partialDigits > 0) {
              // Compare only first N digits
              cpfMatches = orderCpf.startsWith(inputCpf) && inputCpf.length === partialDigits;
            } else {
              // Full CPF comparison
              cpfMatches = inputCpf === orderCpf;
            }
          }

          if (cpfMatches) {
            // CPF matches - show order details
            let formatted = '';
            if (orderSource === 'li') {
              formatted = formatLIOrderResponse(pendingOrder, agent);
            } else if (orderSource === 'bling') {
              formatted = formatBlingOrderResponse(pendingOrder, agent);
            }
            
            // Move to verified column if configured
            if (agent?.after_verified_column_id) {
              await supabase.from('conversations').update({
                kanban_column_id: agent.after_verified_column_id,
              }).eq('id', conversation.id);
            }

            newState.stage = 'menu';
            newState.context = {};
            const successPrefix = verificationMessages?.cpf_verified || '✅ CPF verificado com sucesso!\n\n';
            response = successPrefix + formatted;
          } else {
            // CPF doesn't match
            if (cpfAttempts >= maxAttempts) {
              // Max attempts reached
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
              
              // Also transfer to human
              await transitionToHuman(supabase, conversation, agent, 'cpf_falhou');
              triggerOutboundProcessing();
            } else {
              // Wrong CPF, allow retry
              newState.context = { ...state.context, cpf_attempts: cpfAttempts };
              response = verificationMessages?.cpf_invalid || `❌ CPF não confere. Tentativa ${cpfAttempts}/${maxAttempts}. Tente novamente:`;
            }
          }
        }
        break;
      }

      case 'wholesale':
        await transitionToHuman(supabase, conversation, agent, 'atacado');
        response = '✅ Informações recebidas! Um atendente especializado entrará em contato em breve.';
        break;

      default:
        response = buildMenuOnlyText();
        newState.stage = 'menu';
    }

    // Update state and release lock atomically
    await supabase.from('conversations').update({
      bot_state_json: newState,
      bot_locked_until: null,
    }).eq('id', conversation.id);

    // Send response via outbound queue
    if (response) {
      await enqueueBotMessage(supabase, conversation, response);
      // Trigger immediate outbound processing (fire-and-forget)
      triggerOutboundProcessing();
    }

    return new Response(JSON.stringify({ success: true, stage: newState.stage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    // Release lock on error
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function transitionToHuman(supabase: ServiceClient, conversation: Record<string, unknown>, agent: Record<string, unknown>, tag?: string) {
  const updateData: Record<string, unknown> = {
    handoff_mode: true,
    ai_enabled: false,
    status: 'pending',
    bot_state_json: { stage: 'human', context: {} },
    bot_locked_until: null,
  };

  if (agent?.human_transfer_column_id) {
    updateData.kanban_column_id = agent.human_transfer_column_id;
  }

  await supabase.from('conversations').update(updateData).eq('id', conversation.id);

  // Log event
  await supabase.from('conversation_events').insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    type: 'handoff_on',
    payload_json: { trigger: 'bot_transfer', tag },
  });

  // System message
  await supabase.from('messages').insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversation.id,
    sender_type: 'system',
    content: '🔔 Cliente solicitou atendimento humano',
    content_type: 'text',
    status: 'sent',
    direction: 'system',
    type: 'text',
  });

  // Send confirmation to customer via queue
  await enqueueBotMessage(supabase, conversation, '👤 Transferindo para um atendente. Aguarde um momento...');

  // Add tag if specified
  if (tag) {
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('tenant_id', conversation.tenant_id)
      .eq('name', tag)
      .maybeSingle();

    let tagId = existingTag?.id;
    if (!tagId) {
      const { data: newTag } = await supabase
        .from('tags')
        .insert({ tenant_id: conversation.tenant_id, name: tag, color: '#3B82F6' })
        .select('id')
        .single();
      tagId = newTag?.id;
    }

    if (tagId) {
      await supabase.from('conversation_tags').upsert({
        conversation_id: conversation.id,
        tag_id: tagId,
      });
    }
  }
}

async function lookupOrderRaw(supabase: ServiceClient, tenantId: string, orderNum: string, agent: Record<string, unknown>): Promise<{ raw: Record<string, unknown>; source: string; formatted: string } | null> {
  const cleanNum = orderNum.replace(/\D/g, '');
  if (!cleanNum) return null;

  log.info(`🔍 Looking up order: ${cleanNum} for tenant: ${tenantId}`);

  const storeIntegrationId = agent?.store_integration_id;
  
  // 1. Try Loja Integrada orders
  {
    let query = supabase
      .from('li_orders')
      .select('order_number, status_name, created_at_remote, totals_json, items_json, shipping_json, raw_json')
      .eq('tenant_id', tenantId);
    
    if (storeIntegrationId) {
      query = query.eq('integration_id', storeIntegrationId);
    }
    
    const { data: liOrders } = await query
      .eq('order_number', cleanNum)
      .limit(1);
    
    if (liOrders && liOrders.length > 0) {
      const order = liOrders[0];
      return { raw: order, source: 'li', formatted: formatLIOrderResponse(order, agent) };
    }
  }

  // 2. Try Bling orders
  {
    let query = supabase
      .from('bling_orders')
      .select('numero, situacao_nome, data_criacao, valor_total, cliente_nome, cliente_cpf_cnpj, forma_pagamento, forma_envio, volumes, etiqueta, itens:bling_order_items(produto_nome, quantidade, valor_unitario)')
      .eq('tenant_id', tenantId);
    
    if (storeIntegrationId) {
      query = query.eq('integration_id', storeIntegrationId);
    }
    
    const { data: blingOrders } = await query
      .eq('numero', cleanNum)
      .limit(1);
    
    if (blingOrders && blingOrders.length > 0) {
      const order = blingOrders[0];
      return { raw: order, source: 'bling', formatted: formatBlingOrderResponse(order, agent) };
    }
  }

  // 3. Try Melhor Envio shipments
  {
    const { data: shipments } = await supabase
      .from('me_shipments')
      .select('id, me_id, external_order_number, status, tracking_code, carrier, created_at')
      .eq('tenant_id', tenantId)
      .eq('external_order_number', cleanNum)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (shipments && shipments.length > 0) {
      const s = shipments[0];
      const statusMap: Record<string, string> = {
        'posted': '📬 Postado',
        'in_transit': '🚚 Em trânsito',
        'delivered': '✅ Entregue',
        'canceled': '❌ Cancelado',
        'pending': '⏳ Pendente',
      };
      const statusLabel = statusMap[s.status] || s.status;
      let trackingInfo = '';
      if (s.tracking_code) {
        trackingInfo = `\n📮 *Rastreio:* ${s.tracking_code}`;
      }
      const formatted = `📦 *Rastreamento do Pedido #${s.external_order_number}*\n\n🚚 *Transportadora:* ${s.carrier || 'Não informada'}\n📊 *Status:* ${statusLabel}${trackingInfo}\n\nDigite "menu" para voltar ao menu principal.`;
      return { raw: s, source: 'me', formatted };
    }
  }

  return null;
}

function formatLIOrderResponse(order: Record<string, unknown>, agent: Record<string, unknown>): string {
  const orderNum = order.order_number;
  const status = order.status_name || 'Não informado';
  const date = order.created_at_remote ? new Date(order.created_at_remote).toLocaleDateString('pt-BR') : '';
  const totals = order.totals_json || {};
  const total = totals.total ? Number(totals.total).toFixed(2) : '0.00';
  const shipping = order.shipping_json || {};
  const tracking = shipping.tracking_code || '';
  const clientName = order.raw_json?.cliente?.nome || shipping.address?.nome || '';

  // Build items text
  const orderItems = order.items_json;
  let itemsText = '';
  if (orderItems && Array.isArray(orderItems) && orderItems.length > 0) {
    itemsText = orderItems.slice(0, 5).map((item: Record<string, unknown>) => {
      const name = item.name || item.produto_nome || 'Produto';
      const qty = item.qty || item.quantidade || 1;
      return `• ${name} (x${qty})`;
    }).join('\n');
    if (orderItems.length > 5) itemsText += `\n... e mais ${orderItems.length - 5} itens`;
  }

  if (agent?.order_details_template) {
    let template = agent.order_details_template;
    template = template
      // Portuguese aliases
      .replace(/\{numero\}/g, orderNum)
      .replace(/\{situacao_nome\}/g, status)
      .replace(/\{data_criacao\}/g, date)
      .replace(/\{cliente_nome\}/g, clientName)
      .replace(/\{valor_total\}/g, total)
      .replace(/\{codigo_rastreio\}/g, tracking || 'Não disponível')
      .replace(/\{order_items\}/g, itemsText || 'Nenhum item')
      .replace(/\{forma_pagamento\}/g, 'Não informado')
      // English aliases (backward compat)
      .replace(/\{order_number\}/g, orderNum)
      .replace(/\{status\}/g, status)
      .replace(/\{customer_name\}/g, clientName)
      .replace(/\{date\}/g, date)
      .replace(/\{total\}/g, total)
      .replace(/\{tracking_code\}/g, tracking || 'Não disponível')
      .replace(/\{payment_method\}/g, 'Não informado');
    return template + '\n\nDigite "menu" para voltar ao menu principal.';
  }

  let items = '';
  if (itemsText) items = '\n\n📋 *Itens:*\n' + itemsText;

  let trackingLine = '';
  if (tracking) trackingLine = `\n📮 *Rastreio:* ${tracking}`;

  return `📦 *Pedido #${orderNum}*\n\n👤 *Cliente:* ${clientName}\n📅 *Data:* ${date}\n💰 *Total:* R$ ${total}\n📊 *Status:* ${status}${trackingLine}${items}\n\nDigite "menu" para voltar ao menu principal.`;
}

function formatBlingOrderResponse(order: Record<string, unknown>, agent: Record<string, unknown>): string {
  const orderNum = order.numero;
  const status = order.situacao_nome || 'Não informado';
  const clientName = order.cliente_nome || '';
  const date = order.data_criacao ? new Date(order.data_criacao).toLocaleDateString('pt-BR') : '';
  const total = order.valor_total ? Number(order.valor_total).toFixed(2) : '0.00';
  
  let tracking = '';
  if (order.etiqueta?.codigo) tracking = order.etiqueta.codigo;
  if (!tracking && order.volumes && Array.isArray(order.volumes)) {
    for (const vol of order.volumes) {
      if (vol.codigoRastreamento) { tracking = vol.codigoRastreamento; break; }
    }
  }

  // Build items text
  let itemsText = '';
  if (order.itens && Array.isArray(order.itens) && order.itens.length > 0) {
    itemsText = order.itens.slice(0, 5).map((item: Record<string, unknown>) => {
      const name = item.produto_nome || 'Produto';
      const qty = item.quantidade || 1;
      return `• ${name} (x${qty})`;
    }).join('\n');
    if (order.itens.length > 5) itemsText += `\n... e mais ${order.itens.length - 5} itens`;
  }

  if (agent?.order_details_template) {
    let template = agent.order_details_template;
    template = template
      // Portuguese aliases
      .replace(/\{numero\}/g, orderNum)
      .replace(/\{situacao_nome\}/g, status)
      .replace(/\{data_criacao\}/g, date)
      .replace(/\{cliente_nome\}/g, clientName)
      .replace(/\{valor_total\}/g, total)
      .replace(/\{codigo_rastreio\}/g, tracking || 'Não disponível')
      .replace(/\{order_items\}/g, itemsText || 'Nenhum item')
      .replace(/\{forma_pagamento\}/g, order.forma_pagamento || 'Não informado')
      // English aliases (backward compat)
      .replace(/\{order_number\}/g, orderNum)
      .replace(/\{status\}/g, status)
      .replace(/\{customer_name\}/g, clientName)
      .replace(/\{date\}/g, date)
      .replace(/\{total\}/g, total)
      .replace(/\{tracking_code\}/g, tracking || 'Não disponível')
      .replace(/\{payment_method\}/g, order.forma_pagamento || 'Não informado');
    return template + '\n\nDigite "menu" para voltar ao menu principal.';
  }

  let items = '';
  if (itemsText) items = '\n\n📋 *Itens:*\n' + itemsText;

  let trackingLine = '';
  if (tracking) trackingLine = `\n📮 *Rastreio:* ${tracking}`;

  return `📦 *Pedido #${orderNum}*\n\n👤 *Cliente:* ${clientName}\n📅 *Data:* ${date}\n💰 *Total:* R$ ${total}\n📊 *Status:* ${status}${trackingLine}${items}\n\nDigite "menu" para voltar ao menu principal.`;
}

function triggerOutboundProcessing() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  fetch(`${supabaseUrl}/functions/v1/process-outbound-queue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: 'bot-engine' }),
  }).then(() => {
    log.info('📤 Triggered outbound queue processing');
  }).catch((err) => {
    log.warn('⚠️ Failed to trigger outbound processing:', err);
  });
}

async function enqueueBotMessage(supabase: ServiceClient, conversation: Record<string, unknown>, content: string) {
  // Token check
  const { data: hasTokens } = await supabase.rpc('has_enough_tokens', {
    _tenant_id: conversation.tenant_id,
    _amount: 1,
  });

  if (!hasTokens) {
    log.info('⚠️ No tokens for bot message');
    return;
  }

  // Create message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: conversation.tenant_id,
      conversation_id: conversation.id,
      sender_type: 'bot',
      content,
      content_type: 'text',
      status: 'queued',
      direction: 'outbound',
      type: 'text',
    })
    .select()
    .single();

  if (error) {
    log.error('❌ Error creating bot message:', error);
    return;
  }

  // Resolve channel
  let channelId = conversation.channel_id;
  if (!channelId) {
    const { data: ch } = await supabase
      .from('whatsapp_channels')
      .select('id')
      .eq('tenant_id', conversation.tenant_id)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();
    channelId = ch?.id;
  }

  if (!channelId) {
    log.error('❌ No channel found for bot message');
    return;
  }

  const contact = conversation.contact;
  const phone = contact?.phone || '';

  // Enqueue
  await supabase.from('outbound_queue').insert({
    tenant_id: conversation.tenant_id,
    message_id: message.id,
    channel_id: channelId,
    to_phone_e164: phone,
    payload_json: { text: content },
    status: 'pending',
    next_retry_at: new Date().toISOString(),
  });

  // Deduct token
  await supabase.rpc('deduct_tokens', {
    _tenant_id: conversation.tenant_id,
    _amount: 1,
    _type: 'bot_message',
    _description: 'Mensagem do bot',
    _reference_id: message.id,
  });

  // Update conversation
  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
  }).eq('id', conversation.id);
}
