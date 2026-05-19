import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger, type Logger } from "../_shared/correlation.ts";
import { getStoreIntegration, type StoreIntegrationInfo } from "../_shared/ai-chat-store.ts";
import { sendWhatsAppMessage } from "../_shared/ai-chat-whatsapp.ts";
import type { DataAccess } from "../_shared/ai-chat-context.ts";
import type { AIAgentRecord } from "../_shared/supabase-types.ts";
import { AI_AGENT_COLUMNS } from "../_shared/select-columns.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { handleButtonClick } from "../_shared/ai-chat-button-handler.ts";
import { handleShippingVerification } from "../_shared/ai-chat-verification-shipping.ts";
import { handleOrderVerification } from "../_shared/ai-chat-verification-order.ts";
import { handleAgentTransfer } from "../_shared/ai-chat-agent-transfer.ts";
import { callAI } from "../_shared/ai-chat-ai-caller.ts";
import type { VerificationData, ChatRequest } from "../_shared/ai-chat-types.ts";
import {
  defaultShippingVerificationMessages,
  defaultOrderVerificationMessages,
  DEFAULT_SHIPPING_DETAILS_TEMPLATE,
} from "../_shared/ai-chat-verification-utils.ts";

let log: Logger = createLogger("ai-chat", "init");

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  log = createLogger("ai-chat", cid);

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    // deno-lint-ignore no-explicit-any
    const supabase: any = createClient(supabaseUrl, supabaseServiceKey);

    const payload: ChatRequest = await req.json();
    log.info('🤖 AI Chat request:', payload);

    // ── Button click ──────────────────────────────────────────────────
    if (payload.button_click_id) {
      const result = await handleButtonClick(supabase, evolutionApiUrl, evolutionApiKey, payload, corsHeaders, log);
      if (result) return result;
    }

    // ── Load agent ────────────────────────────────────────────────────
    const { data: conversationData } = await supabase
      .from('conversations')
      .select('kanban_column_id, current_ai_agent_id, verification_state, verification_data')
      .eq('id', payload.conversation_id)
      .eq('tenant_id', payload.tenant_id)
      .single();

    log.info('📊 Conversation data:', conversationData);

    // deno-lint-ignore no-explicit-any
    let aiAgent: any = null;
    if (conversationData?.current_ai_agent_id) {
      const { data: a } = await supabase.from('ai_agents').select(AI_AGENT_COLUMNS).eq('id', conversationData.current_ai_agent_id).eq('is_active', true).single();
      if (a) { aiAgent = a; log.info('🤖 Current agent from transfer:', aiAgent.name); }
    }
    if (!aiAgent && conversationData?.kanban_column_id) {
      const { data: asgn } = await supabase.from('ai_agent_column_assignments').select('agent_id, ai_agents(*)').eq('column_id', conversationData.kanban_column_id).eq('tenant_id', payload.tenant_id).single();
      if (asgn?.ai_agents) { aiAgent = Array.isArray(asgn.ai_agents) ? asgn.ai_agents[0] : asgn.ai_agents; log.info('🤖 Column agent:', aiAgent?.name); }
    }

    let { data: aiConfig } = await supabase.from('ai_assistant_configs').select('*, default_ai_agent:ai_agents(*)').eq('tenant_id', payload.tenant_id).single();
    if (!aiAgent && aiConfig?.default_ai_agent) {
      const def = aiConfig.default_ai_agent as AIAgentRecord | null;
      if (def?.is_active) {
        aiAgent = def;
        log.info('🤖 Default agent from config:', aiAgent.name);
        await supabase.from('conversations').update({ current_ai_agent_id: aiAgent.id }).eq('id', payload.conversation_id);
      }
    }
    if (!aiConfig) {
      const { data: nc } = await supabase.from('ai_assistant_configs').insert({ tenant_id: payload.tenant_id, is_active: true }).select().single();
      aiConfig = nc;
    }

    const isAgentActive = aiAgent ? aiAgent.is_active : aiConfig?.is_active;
    if (!isAgentActive) {
      const reason = aiAgent ? `Agent '${aiAgent.name}' is disabled` : 'Global AI disabled';
      log.info(`⏭️ AI skipped: ${reason}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Conversation + message history ────────────────────────────────
    const { data: conversation } = await supabase.from('conversations').select('*, contact:contacts(*)').eq('id', payload.conversation_id).single();
    if (!conversation) throw new Error('Conversation not found');

    const maxMessages = aiConfig?.max_context_messages || 10;
    const { data: messages } = await supabase.from('messages').select('id, conversation_id, content, sender_type, direction, type, created_at, metadata').eq('conversation_id', payload.conversation_id).order('created_at', { ascending: false }).limit(maxMessages);
    const messageHistory = (messages || []).reverse();

    const currentMessage = messageHistory.find((m: any) => m.id === payload.message_id);
    const initializationOnly = payload.initialization_only || false;
    if (!currentMessage && !payload.combined_message_content && !initializationOnly) throw new Error('Message not found');

    const messageContent = payload.combined_message_content || currentMessage?.content || '';
    log.info(`📝 Processing: "${messageContent.substring(0, 100)}" (initialization_only: ${initializationOnly})`);

    // ── Verification config ───────────────────────────────────────────
    const verificationState: string | null = conversationData?.verification_state;
    const verificationData = conversationData?.verification_data as VerificationData | null;
    log.info(`🔐 Verification state: ${verificationState || 'none'}`);

    const agentDataAccess = aiAgent?.data_access as DataAccess | null;
    const hasOrderVerification = aiAgent?.order_verification_enabled === true || (agentDataAccess?.orders && agentDataAccess?.smart_search);
    const verificationType: 'order' | 'shipping' = (aiAgent?.verification_type as 'order' | 'shipping') || 'order';
    const isShippingVerification = verificationType === 'shipping';
    log.info(`🔍 Verification type: ${verificationType}`);

    log.info('🔧 Agent debug:', { agent_name: aiAgent?.name, order_verification_enabled: aiAgent?.order_verification_enabled, verification_type: aiAgent?.verification_type, order_verification_mode: aiAgent?.order_verification_mode });

    const verificationMode = aiAgent?.order_verification_mode || 'sequential';
    const verificationMessages = {
      ...(isShippingVerification ? defaultShippingVerificationMessages() : defaultOrderVerificationMessages()),
      ...(aiAgent?.order_verification_messages as Record<string, string> || {}),
    };

    const shippingDetailsTemplate = aiAgent?.order_details_template || DEFAULT_SHIPPING_DETAILS_TEMPLATE;
    const trackingLinkBase = aiAgent?.tracking_link_base || '';
    const orderNotFoundColumnId = aiAgent?.order_not_found_column_id || null;
    const cpfMaxAttemptsColumnId = aiAgent?.cpf_max_attempts_column_id || null;
    const afterVerifiedColumnId = aiAgent?.after_verified_column_id || null;

    const storeInfo: StoreIntegrationInfo | null = isShippingVerification ? null : await getStoreIntegration(supabase, payload.tenant_id, aiAgent?.store_integration_id);
    log.info(`🏪 Store: ${storeInfo?.type || 'none'} (${storeInfo?.integrationId || 'N/A'})`);

    // ── Auto-initialize verification ──────────────────────────────────
    const canInit = hasOrderVerification && !verificationState && verificationState !== 'verified' && aiAgent && (isShippingVerification || storeInfo);
    log.info(`🔐 Auto-init: hasVerification=${hasOrderVerification}, state=${verificationState}, canInit=${canInit}`);
    if (canInit) {
      log.info('🔐 Auto-initializing verification...');
      const initialState = verificationMode === 'simultaneous' ? 'awaiting_both' : 'awaiting_order_number';
      await supabase.from('conversations').update({ verification_state: initialState, verification_data: null, current_ai_agent_id: aiAgent.id }).eq('id', payload.conversation_id);
      const welcomeMsg = verificationMode === 'simultaneous' ? verificationMessages.ask_both : (aiAgent.welcome_message || verificationMessages.ask_order_number);
      await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, payload.integration_id, payload.contact_phone, welcomeMsg, supabase, payload.conversation_id);
      await supabase.from('messages').insert({ conversation_id: payload.conversation_id, tenant_id: payload.tenant_id, sender_type: 'bot', content: welcomeMsg, status: 'sent' });
      await supabase.rpc('deduct_tokens', { _tenant_id: payload.tenant_id, _amount: 1, _type: 'ai_message', _description: 'Verificação: boas-vindas', _reference_id: payload.conversation_id });
      return new Response(JSON.stringify({ success: true, action: 'order_verification_initialized', agent: aiAgent.name, mode: verificationMode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (initializationOnly) {
      log.info('🔐 Initialization only — already initialized or no verification needed');
      return new Response(JSON.stringify({ success: true, action: 'initialization_only_complete', agent: aiAgent?.name, verification_state: verificationState }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Shipping verification ─────────────────────────────────────────
    if (hasOrderVerification && aiAgent && isShippingVerification && verificationState) {
      const shippingBase = { supabase, evolutionApiUrl, evolutionApiKey, conversationId: payload.conversation_id, tenantId: payload.tenant_id, integrationId: payload.integration_id, contactPhone: payload.contact_phone, messageContent, verificationState, verificationData, verificationMessages, cpfMaxAttemptsColumnId, shippingDetailsTemplate, trackingLinkBase, corsHeaders, log };
      const result = await handleShippingVerification(shippingBase);
      if (result) return result;
    }

    // ── Order verification ────────────────────────────────────────────
    if (hasOrderVerification && aiAgent && !isShippingVerification && storeInfo && verificationState && verificationState !== 'verified') {
      const orderBase = { supabase, evolutionApiUrl, evolutionApiKey, conversationId: payload.conversation_id, tenantId: payload.tenant_id, integrationId: payload.integration_id, contactPhone: payload.contact_phone, messageContent, verificationState, verificationData, verificationMessages, storeInfo, orderNotFoundColumnId, cpfMaxAttemptsColumnId, afterVerifiedColumnId, corsHeaders, log };
      const result = await handleOrderVerification(orderBase);
      if (result) return result;
    }

    // ── Agent transfer / keyword actions / human transfer ─────────────
    const messageText = messageContent.toLowerCase();
    const transferResult = await handleAgentTransfer({ supabase, evolutionApiUrl, evolutionApiKey, conversationId: payload.conversation_id, tenantId: payload.tenant_id, integrationId: payload.integration_id, contactPhone: payload.contact_phone, messageText, aiAgent, aiConfig, corsHeaders, log });
    if (transferResult.response) return transferResult.response;
    if (transferResult.updatedAgent) aiAgent = transferResult.updatedAgent;

    // ── AI call ───────────────────────────────────────────────────────
    return await callAI({ supabase, evolutionApiUrl, evolutionApiKey, conversationId: payload.conversation_id, tenantId: payload.tenant_id, integrationId: payload.integration_id, contactPhone: payload.contact_phone, storeInfo, aiAgent, aiConfig, conversation, messageHistory, corsHeaders, log });

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log.error('❌ AI Chat error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
