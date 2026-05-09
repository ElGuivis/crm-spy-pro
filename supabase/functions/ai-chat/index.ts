import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger, type Logger } from "../_shared/correlation.ts";
import { getStoreIntegration, getTrackingCode, getOrderCpf, type StoreIntegrationInfo } from "../_shared/ai-chat-store.ts";
import { type AIProviderConfig, getAllAIConfigs, getAIConfig, updateProviderHealth, callAIWithFallback } from "../_shared/ai-chat-providers.ts";
import { sendWhatsAppMessage, sendWhatsAppButtons, type InteractiveButton } from "../_shared/ai-chat-whatsapp.ts";
import { buildEnrichedContext, type DataAccess } from "../_shared/ai-chat-context.ts";
import type { AIAgentRecord } from "../_shared/supabase-types.ts";
import {
  AI_AGENT_COLUMNS, ME_SHIPMENT_COLUMNS,
  getStoreColumns,
} from "../_shared/select-columns.ts";

/** Verification data stored on conversation */
interface VerificationData {
  order_id?: string;
  order_number?: string;
  cpf_prefix?: string;
  phone_suffix?: string;
  verification_type?: 'cpf' | 'phone';
  order_data?: Record<string, unknown>;
  attempts?: number;
  shipment_id?: string;
  shipment_data?: Record<string, unknown>;
}

/** Generic order item shape (Bling / LI) */
interface OrderItemRow {
  id: string;
  order_id: string;
  quantidade?: number | null;
  produto_nome?: string | null;
  preco_subtotal?: number | null;
  valor_total?: number | null;
  [key: string]: unknown;
}

/** Generic order row shape (Bling / LI) */
interface OrderRow {
  id: string;
  numero?: string;
  data_criacao?: string | null;
  situacao_nome?: string | null;
  valor_total?: number | null;
  valor_frete?: number | null;
  forma_pagamento?: string | null;
  forma_envio?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_cpf_cnpj?: string | null;
  endereco_entrega?: Record<string, unknown> | null;
  endereco_entrega_cidade?: string | null;
  endereco_entrega_estado?: string | null;
  etiqueta?: Record<string, unknown> | null;
  volumes?: unknown[] | null;
  codigo_rastreio?: string | null;
  [key: string]: unknown;
}

/** Generic product row */
interface ProductRow {
  id: string;
  nome: string;
  preco?: number | null;
  preco_cheio?: number | null;
  preco_promocional?: number | null;
  estoque_atual?: number | null;
  estoque_quantidade?: number | null;
  categoria_nome?: string | null;
  [key: string]: unknown;
}

/** Generic customer row */
interface CustomerRow {
  id: string;
  nome?: string;
  cpf_cnpj?: string | null;
  cpf?: string | null;
  celular?: string | null;
  telefone?: string | null;
  telefone_celular?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/** Tracking event entry */
interface TrackingEvent {
  date?: string;
  description?: string;
  message?: string;
}

/** Shipment record (Melhor Envio) */
interface ShipmentRow {
  id: string;
  external_order_number?: string | null;
  carrier?: string | null;
  service_name?: string | null;
  status?: string | null;
  tracking_code?: string | null;
  estimated_delivery_at?: string | null;
  tracking_history?: TrackingEvent[] | null;
  tracking_data?: TrackingEvent[] | null;
  receiver_city?: string | null;
  receiver_state?: string | null;
  receiver_name?: string | null;
  posted_at?: string | null;
  delivered_at?: string | null;
  [key: string]: unknown;
}

import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

interface ChatRequest {
  conversation_id: string;
  message_id?: string;
  tenant_id: string;
  contact_phone: string;
  integration_id: string;
  button_click_id?: string;
  combined_message_content?: string; // For buffered messages
  initialization_only?: boolean; // Flag para inicialização sem processar mensagem
}

// InteractiveButton is now imported from _shared/ai-chat-whatsapp.ts

// DataAccess is now imported from _shared/ai-chat-context.ts

interface AgentTransferRule {
  target_agent_id: string;
  keywords: string[];
  description?: string;
}

interface KeywordActionRule {
  keywords: string[];
  action_type: 'send_response' | 'move_column' | 'send_and_move';
  response_message?: string;
  target_column_id?: string;
  description?: string;
}

// Store helpers (getStoreIntegration, getTrackingCode, getOrderCpf) imported from _shared/ai-chat-store.ts

let log: Logger = createLogger("ai-chat", "init");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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


    // Provider helpers (buildProviderConfig, getAllAIConfigs, getAIConfig, 
    // updateProviderHealth, callAIWithFallback) imported from _shared/ai-chat-providers.ts
    // Note: callAIWithFallback now takes supabase as first arg

    const payload: ChatRequest = await req.json();

    log.info('🤖 AI Chat request:', payload);

    // ========== BUTTON CLICK PROCESSING ==========
    // If this is a button click, process it before AI interaction
    if (payload.button_click_id) {
      log.info(`🔘 Processing button click: ${payload.button_click_id}`);
      
      // Get the conversation's current AI agent to check its buttons
      // Defense-in-depth: scope by tenant_id from payload (caller already verified via requireInternalAuth)
      const { data: conversationData } = await supabase
        .from('conversations')
        .select('current_ai_agent_id, kanban_column_id')
        .eq('id', payload.conversation_id)
        .eq('tenant_id', payload.tenant_id)
        .single();

      let currentAgentId = conversationData?.current_ai_agent_id;
      
      // If no current agent, try to get from column assignment
      if (!currentAgentId && conversationData?.kanban_column_id) {
        const { data: assignment } = await supabase
          .from('ai_agent_column_assignments')
          .select('agent_id')
          .eq('column_id', conversationData.kanban_column_id)
          .eq('tenant_id', payload.tenant_id)
          .single();
        currentAgentId = assignment?.agent_id;
      }

      if (currentAgentId) {
        const { data: currentAgent } = await supabase
          .from('ai_agents')
          .select('interactive_buttons, name')
          .eq('id', currentAgentId)
          .single();

        if (currentAgent?.interactive_buttons) {
          const buttons = currentAgent.interactive_buttons as InteractiveButton[];
          const clickedButton = buttons.find(b => b.id === payload.button_click_id);

          if (clickedButton) {
            log.info(`✅ Found clicked button: ${clickedButton.display_text} (${clickedButton.action_type})`);

            if (clickedButton.action_type === 'send_response' && clickedButton.response_message) {
              // Send the pre-programmed response
              log.info('📤 Sending pre-programmed response');
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                clickedButton.response_message,
                supabase,
                payload.conversation_id
              );

              // Save the response message
              await supabase
                .from('messages')
                .insert({
                  conversation_id: payload.conversation_id,
                  tenant_id: payload.tenant_id,
                  sender_type: 'bot',
                  content: clickedButton.response_message,
                  status: 'sent',
                });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'button_response',
                button_id: payload.button_click_id,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            if (clickedButton.action_type === 'transfer_to_human') {
              log.info('🔄 Transfer to human requested via button');
              
              // Get target column from button config
              const targetColumnId = clickedButton.target_column_id;
              log.info(`📋 Target column for transfer: ${targetColumnId || 'keep current'}`);
              
              await supabase
                .from('conversations')
                .update({ 
                  status: 'pending',
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  ...(targetColumnId && { kanban_column_id: targetColumnId }),
                })
                .eq('id', payload.conversation_id);

              const transferMessage = 'Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor. 🙋';
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                transferMessage,
                supabase,
                payload.conversation_id
              );

              await supabase
                .from('messages')
                .insert({
                  conversation_id: payload.conversation_id,
                  tenant_id: payload.tenant_id,
                  sender_type: 'bot',
                  content: transferMessage,
                  status: 'sent',
                });

              return new Response(JSON.stringify({ 
                success: true, 
                transferred: true,
                action: 'button_transfer_human',
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            if (clickedButton.action_type === 'transfer_to_agent' && clickedButton.target_agent_id) {
              log.info(`🔄 Transfer to agent requested via button: ${clickedButton.target_agent_id}`);
              
              // Fetch target agent
              const { data: targetAgent } = await supabase
                .from('ai_agents')
                .select(AI_AGENT_COLUMNS)
                .eq('id', clickedButton.target_agent_id)
                .eq('is_active', true)
                .single();

              if (targetAgent) {
                // Update conversation with new AI agent
                await supabase
                  .from('conversations')
                  .update({ current_ai_agent_id: targetAgent.id })
                  .eq('id', payload.conversation_id);

                // Send transfer message
                const transferMessage = `Entendi! Vou transferir você para ${targetAgent.name}. Um momento... 🔄`;
                
                await sendWhatsAppMessage(
                  evolutionApiUrl,
                  evolutionApiKey,
                  payload.integration_id,
                  payload.contact_phone,
                  transferMessage,
                  supabase,
                  payload.conversation_id
                );

                await supabase
                  .from('messages')
                  .insert({
                    conversation_id: payload.conversation_id,
                    tenant_id: payload.tenant_id,
                    sender_type: 'bot',
                    content: transferMessage,
                    status: 'sent',
                  });

                // Send welcome message from new agent
                if (targetAgent.welcome_message) {
                  await sendWhatsAppMessage(
                    evolutionApiUrl,
                    evolutionApiKey,
                    payload.integration_id,
                    payload.contact_phone,
                    targetAgent.welcome_message,
                    supabase,
                    payload.conversation_id
                  );

                  await supabase
                    .from('messages')
                    .insert({
                      conversation_id: payload.conversation_id,
                      tenant_id: payload.tenant_id,
                      sender_type: 'bot',
                      content: targetAgent.welcome_message,
                      status: 'sent',
                    });
                }

                // Now send interactive buttons from new agent if configured
                if (targetAgent.interactive_buttons && (targetAgent.interactive_buttons as InteractiveButton[]).length > 0) {
                  const newButtons = targetAgent.interactive_buttons as InteractiveButton[];
                  await sendWhatsAppButtons(
                    evolutionApiUrl,
                    evolutionApiKey,
                    payload.integration_id,
                    payload.contact_phone,
                    targetAgent.name,
                    'Como posso ajudá-lo?',
                    newButtons,
                    supabase
                  );
                }

                return new Response(JSON.stringify({ 
                  success: true, 
                  action: 'button_transfer_agent',
                  new_agent_id: targetAgent.id,
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
          }
        }
      }
    }

    // ========== REGULAR AI PROCESSING ==========

    // Get conversation to check column, current AI agent, and verification state
    // Defense-in-depth: scope by tenant_id
    const { data: conversationData } = await supabase
      .from('conversations')
      .select('kanban_column_id, current_ai_agent_id, verification_state, verification_data')
      .eq('id', payload.conversation_id)
      .eq('tenant_id', payload.tenant_id)
      .single();

    log.info('📊 Conversation data:', conversationData);

    // Try to get AI agent - Priority: current_ai_agent_id > column assignment
    // deno-lint-ignore no-explicit-any
    let aiAgent: any = null;

    // First check if there's a current AI agent set by a previous transfer
    if (conversationData?.current_ai_agent_id) {
      const { data: currentAgent } = await supabase
        .from('ai_agents')
        .select(AI_AGENT_COLUMNS)
        .eq('id', conversationData.current_ai_agent_id)
        .eq('is_active', true)
        .single();

      if (currentAgent) {
        aiAgent = currentAgent;
        log.info('🤖 Using current AI agent from transfer:', aiAgent?.name);
      }
    }

    // Fallback to column assignment if no current agent
    if (!aiAgent && conversationData?.kanban_column_id) {
      const { data: assignment } = await supabase
        .from('ai_agent_column_assignments')
        .select(`
          agent_id,
          ai_agents(*)
        `)
        .eq('column_id', conversationData.kanban_column_id)
        .eq('tenant_id', payload.tenant_id)
        .single();

      // ai_agents is returned as an object in a single() query with a foreign key relation
      if (assignment?.ai_agents) {
        aiAgent = Array.isArray(assignment.ai_agents) 
          ? assignment.ai_agents[0] 
          : assignment.ai_agents;
        log.info('🤖 Found AI agent for column:', aiAgent?.name);
      }
    }

    // Get global AI config for tenant (fallback)
    let { data: aiConfig } = await supabase
      .from('ai_assistant_configs')
      .select('*, default_ai_agent:ai_agents(*)')
      .eq('tenant_id', payload.tenant_id)
      .single();

    // Fallback to default AI agent from config if still no agent
    if (!aiAgent && aiConfig?.default_ai_agent) {
      const defaultAgent = aiConfig.default_ai_agent as AIAgentRecord | null;
      if (defaultAgent?.is_active) {
        aiAgent = defaultAgent;
        log.info('🤖 Using default AI agent from config:', aiAgent?.name);
        
        // Also update conversation with this agent for future messages
        await supabase
          .from('conversations')
          .update({ current_ai_agent_id: aiAgent.id })
          .eq('id', payload.conversation_id);
      }
    }

    // If no config exists, create default
    if (!aiConfig) {
      const { data: newConfig } = await supabase
        .from('ai_assistant_configs')
        .insert({
          tenant_id: payload.tenant_id,
          is_active: true,
        })
        .select()
        .single();
      aiConfig = newConfig;
    }

    // Check if AI is active (either agent-specific or global)
    const isAgentActive = aiAgent ? aiAgent.is_active : aiConfig?.is_active;
    if (!isAgentActive) {
      const reason = aiAgent ? `Agent '${aiAgent.name}' is disabled` : 'Global AI disabled';
      log.info(`⏭️ AI skipped: ${reason}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get conversation with contact info
    const { data: conversation } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('id', payload.conversation_id)
      .single();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get message history (last N messages)
    const maxMessages = aiConfig.max_context_messages || 10;
    const { data: messages } = await supabase
      .from('messages')
      .select('id, conversation_id, content, sender_type, direction, type, created_at, metadata')
      .eq('conversation_id', payload.conversation_id)
      .order('created_at', { ascending: false })
      .limit(maxMessages);

    const messageHistory = (messages || []).reverse();

    // Get current message content (use combined content if from buffer)
    const currentMessage = messageHistory.find(m => m.id === payload.message_id);
    const initializationOnly = payload.initialization_only || false;
    
    if (!currentMessage && !payload.combined_message_content && !initializationOnly) {
      throw new Error('Message not found');
    }

    // Use combined message content if provided (from buffer processor)
    const messageContentForProcessing = payload.combined_message_content || currentMessage?.content || '';
    log.info(`📝 Processing message: "${messageContentForProcessing.substring(0, 100)}..." (initialization_only: ${initializationOnly})`);

    // ========== ORDER VERIFICATION FLOW ==========
    // This handles the structured order verification with CPF partial validation
    const verificationState = conversationData?.verification_state;
    const verificationData = conversationData?.verification_data as VerificationData | null;

    log.info(`🔐 Verification state: ${verificationState || 'none'}, data:`, verificationData);

    // Check if agent has order verification enabled via new flag OR legacy (data_access.orders and smart_search)
    const agentDataAccess = aiAgent?.data_access as DataAccess | null;
    const hasOrderVerificationNew = aiAgent?.order_verification_enabled === true;
    const hasOrderVerificationLegacy = agentDataAccess?.orders && agentDataAccess?.smart_search;
    const hasOrderVerification = hasOrderVerificationNew || hasOrderVerificationLegacy;

    // Check verification type: 'order' (default) or 'shipping' for delivery tracking
    const verificationType: 'order' | 'shipping' = (aiAgent?.verification_type as 'order' | 'shipping') || 'order';
    const isShippingVerification = verificationType === 'shipping';
    log.info(`🔍 Verification type: ${verificationType}`);

    // Get verification messages from agent config or use defaults
    log.info('🔧 AI Agent Config Debug:', {
      agent_name: aiAgent?.name,
      order_verification_enabled: aiAgent?.order_verification_enabled,
      verification_type: aiAgent?.verification_type,
      order_verification_mode: aiAgent?.order_verification_mode,
      order_verification_messages: JSON.stringify(aiAgent?.order_verification_messages || {}),
      order_details_template: (aiAgent?.order_details_template || '').substring(0, 100),
      system_prompt_preview: (aiAgent?.system_prompt || '').substring(0, 200),
    });
    
    const defaultVerificationMessages = isShippingVerification ? {
      ask_order_number: "Por favor, informe o *número do pedido* para rastrear sua entrega.",
      ask_cpf: "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado na entrega para confirmar sua identidade.",
      ask_phone: "Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega para confirmar sua identidade.",
      ask_both: "Para rastrear sua entrega, informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado",
      order_not_found: "❌ Não encontrei envio para o pedido *#{order_number}*.\n\nVerifique o número e tente novamente.",
      cpf_wrong: "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
      phone_wrong: "❌ Telefone incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
      max_attempts: "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.",
      cpf_max_attempts: "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.",
      order_verified: "✅ *Entrega encontrada!*\n\n{order_details}",
      after_verified: "Posso ajudar com mais alguma coisa sobre esta entrega?"
    } : {
      ask_order_number: "Por favor, informe o *número do pedido* para que eu possa consultar.",
      ask_cpf: "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.",
      ask_phone: "Por favor, informe os *4 últimos dígitos do telefone* cadastrado no pedido para confirmar sua identidade.",
      ask_both: "Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado",
      order_not_found: "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.",
      cpf_wrong: "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
      phone_wrong: "❌ Telefone incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
      max_attempts: "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.",
      cpf_max_attempts: "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um atendente.",
      order_verified: "✅ *Pedido encontrado!*\n\n{order_details}",
      after_verified: "Posso ajudar com mais alguma coisa sobre este pedido?"
    };
    const verificationMessages = { ...defaultVerificationMessages, ...(aiAgent?.order_verification_messages as Record<string, string> || {}) };
    const verificationMode = aiAgent?.order_verification_mode || 'sequential';

    // Default shipping details template
    const defaultShippingDetailsTemplate = `📦 *Rastreamento do Pedido #{order_number}*

🚚 *Transportadora:* {carrier} {service}
📍 *Status:* {status}
🔢 *Código de Rastreio:* {tracking_code}

📅 *Previsão de Entrega:* {estimated_delivery}
📍 *Destino:* {destination}

📋 *Histórico de Rastreamento:*
{tracking_events}

{after_verified}`;

    // Get shipping details template from agent config or use default
    const shippingDetailsTemplate = aiAgent?.order_details_template || defaultShippingDetailsTemplate;
    
    // Get tracking link base from agent config
    const trackingLinkBase = aiAgent?.tracking_link_base || '';

    // Helper to build shipping details using template
    function buildShippingDetails(shipment: ShipmentRow | null, afterVerifiedMsg: string): string {
      const estimatedDelivery = shipment?.estimated_delivery_at 
        ? new Date(shipment.estimated_delivery_at).toLocaleDateString('pt-BR')
        : 'Não informada';
      
      const trackingEvents = formatTrackingEvents(shipment?.tracking_history || shipment?.tracking_data);
      
      // Build tracking link if we have a base URL and tracking code
      const trackingCode = shipment?.tracking_code || '';
      const linkRastreamento = trackingLinkBase && trackingCode 
        ? `${trackingLinkBase}${trackingCode}`
        : trackingCode || 'Aguardando código';
      
      return replaceMessageVariables(shippingDetailsTemplate, {
        order_number: shipment?.external_order_number || '',
        carrier: shipment?.carrier || 'Não informada',
        service: shipment?.service_name ? `- ${shipment.service_name}` : '',
        status: translateShippingStatus(shipment?.status || 'pending'),
        tracking_code: trackingCode || 'Aguardando',
        estimated_delivery: estimatedDelivery,
        destination: `${shipment?.receiver_city || 'Não informado'}/${shipment?.receiver_state || ''}`,
        receiver_name: shipment?.receiver_name || '',
        receiver_city: shipment?.receiver_city || '',
        receiver_state: shipment?.receiver_state || '',
        tracking_events: trackingEvents,
        posted_at: shipment?.posted_at ? new Date(shipment.posted_at).toLocaleDateString('pt-BR') : 'Não postado',
        delivered_at: shipment?.delivered_at ? new Date(shipment.delivered_at).toLocaleDateString('pt-BR') : '-',
        link_rastreamento: linkRastreamento,
        after_verified: afterVerifiedMsg
      });
    }

    // Get configured Kanban columns for transfers
    const orderNotFoundColumnId = aiAgent?.order_not_found_column_id;
    const cpfMaxAttemptsColumnId = aiAgent?.cpf_max_attempts_column_id;
    const afterVerifiedColumnId = aiAgent?.after_verified_column_id;

    // Get store integration for this agent (or auto-detect) - only for order verification
    const storeInfo = isShippingVerification ? null : await getStoreIntegration(supabase, payload.tenant_id, aiAgent?.store_integration_id);
    log.info(`🏪 Store integration: ${storeInfo?.type || 'none'} (${storeInfo?.integrationId || 'N/A'})`);

    // Helper function to replace message variables
    function replaceMessageVariables(message: string, vars: Record<string, string | number>): string {
      let result = message;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      }
      return result;
    }

    // Helper function to translate Melhor Envio status
    function translateShippingStatus(status: string): string {
      const statusMap: Record<string, string> = {
        'pending': '⏳ Aguardando',
        'released': '✅ Liberado',
        'posted': '📮 Postado',
        'in_transit': '🚚 Em Trânsito',
        'out_for_delivery': '📦 Saiu para Entrega',
        'delivered': '✅ Entregue',
        'canceled': '❌ Cancelado',
        'undelivered': '⚠️ Não entregue',
        'waiting_payment': '💰 Aguardando Pagamento'
      };
      return statusMap[status] || status;
    }

    // Helper function to format tracking events
    function formatTrackingEvents(trackingData: TrackingEvent[] | null | undefined): string {
      if (!trackingData) return 'Sem histórico disponível';
      
      const events = Array.isArray(trackingData) ? trackingData : [];
      if (events.length === 0) return 'Sem histórico disponível';
      
      return events.slice(0, 5).map((e: TrackingEvent) => {
        const date = e.date ? new Date(e.date).toLocaleDateString('pt-BR') : '';
        const time = e.date ? new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const desc = e.description || e.message || 'Atualização';
        return `• ${date} ${time} - ${desc}`;
      }).join('\n');
    }

    // ========== AUTO-INITIALIZE VERIFICATION STATE ==========
    // For shipping verification, we can initialize without store integration
    // IMPORTANT: Do NOT reinitialize if state is 'verified' - let AI handle follow-up questions
    const canInitializeVerification = hasOrderVerification && !verificationState && verificationState !== 'verified' && aiAgent && (isShippingVerification || storeInfo);
    log.info(`🔐 Auto-init check: hasOrderVerification=${hasOrderVerification}, verificationState=${verificationState}, aiAgent=${!!aiAgent}, storeInfo=${!!storeInfo}, canInit=${canInitializeVerification}`);
    if (canInitializeVerification) {
      log.info('🔐 Auto-initializing order verification flow...');
      
      // Set verification state based on mode
      const initialState = verificationMode === 'simultaneous' ? 'awaiting_both' : 'awaiting_order_number';
      
      await supabase
        .from('conversations')
        .update({
          verification_state: initialState,
          verification_data: null,
          current_ai_agent_id: aiAgent.id
        })
        .eq('id', payload.conversation_id);

      // Send welcome message based on mode
      const welcomeMessage = verificationMode === 'simultaneous' 
        ? verificationMessages.ask_both 
        : (aiAgent.welcome_message || verificationMessages.ask_order_number);
      
      await sendWhatsAppMessage(
        evolutionApiUrl,
        evolutionApiKey,
        payload.integration_id,
        payload.contact_phone,
        welcomeMessage,
        supabase,
        payload.conversation_id
      );

      await supabase.from('messages').insert({
        conversation_id: payload.conversation_id,
        tenant_id: payload.tenant_id,
        sender_type: 'bot',
        content: welcomeMessage,
        status: 'sent',
      });

      // Deduct token
      await supabase.rpc('deduct_tokens', {
        _tenant_id: payload.tenant_id,
        _amount: 1,
        _type: 'ai_message',
        _description: 'Verificação de pedido: boas-vindas',
        _reference_id: payload.conversation_id
      });

      return new Response(JSON.stringify({ 
        success: true, 
        action: 'order_verification_initialized',
        agent: aiAgent.name,
        mode: verificationMode
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If this is initialization_only call and we didn't auto-initialize, return early
    if (initializationOnly) {
      log.info('🔐 Initialization only mode - agent already initialized or no verification needed');
      return new Response(JSON.stringify({ 
        success: true, 
        action: 'initialization_only_complete',
        agent: aiAgent?.name,
        verification_state: verificationState
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== SHIPPING VERIFICATION FLOW ==========
    // This handles shipment tracking verification with phone number validation
    if (hasOrderVerification && aiAgent && isShippingVerification) {
      // STATE: awaiting_order_number - Extract order number for shipping
      if (verificationState === 'awaiting_order_number' || verificationState === 'awaiting_both') {
        log.info('📦 Shipping Verification: Awaiting order number...');
        
        // Extract order number from message
        const orderNumberPatterns = [
          /pedido[:\s#]*(\d{3,})/gi,
          /n[uú]mero[:\s#]*(\d{3,})/gi,
          /#(\d{4,})/g,
          /\b(\d{4,10})\b/g
        ];
        
        let extractedOrderNumber: string | null = null;
        for (const pattern of orderNumberPatterns) {
          const matches = messageContentForProcessing.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              extractedOrderNumber = match[1];
              break;
            }
          }
          if (extractedOrderNumber) break;
        }

        // For simultaneous mode, also try to extract CPF digits (3 first digits)
        let extractedCpfDigits: string | null = null;
        if (verificationState === 'awaiting_both') {
          const cpfDigits = messageContentForProcessing.replace(/\D/g, '');
          if (cpfDigits.length >= 3) {
            extractedCpfDigits = cpfDigits.substring(0, 3);
          }
        }

        if (extractedOrderNumber) {
          log.info(`📦 Extracted order number: ${extractedOrderNumber}, searching in me_shipments`);
          
          // Search for the shipment in me_shipments table
          const { data: foundShipment, error: searchError } = await supabase
            .from('me_shipments')
            .select(ME_SHIPMENT_COLUMNS)
            .eq('tenant_id', payload.tenant_id)
            .eq('external_order_number', extractedOrderNumber)
            .order('created_at', { ascending: false })
            .maybeSingle();
          
          if (searchError) {
            log.error('❌ Shipment search error:', searchError);
          }

          if (foundShipment) {
            log.info(`✅ Shipment found: #${foundShipment.external_order_number}, tracking: ${foundShipment.tracking_code}`);
            
            // Get CPF from shipment (receiver_document)
            const shipmentCpf = (foundShipment.receiver_document || '').replace(/\D/g, '');
            const cpfPrefix = shipmentCpf.length >= 11 ? shipmentCpf.substring(0, 3) : '';
            
            // Get Phone as fallback (last 4 digits)
            const shipmentPhone = (foundShipment.receiver_phone || '').replace(/\D/g, '');
            const phoneSuffix = shipmentPhone.length >= 4 ? shipmentPhone.slice(-4) : '';
            
            // Determine verification type: CPF first, then Phone, then auto-approve
            const verificationType = cpfPrefix.length >= 3 ? 'cpf' : (phoneSuffix.length === 4 ? 'phone' : 'none');
            log.info(`📋 Verification type: ${verificationType}, cpfPrefix: ${cpfPrefix || 'N/A'}, phoneSuffix: ${phoneSuffix || 'N/A'}`);
            
            // For simultaneous mode, try to verify immediately
            if (verificationState === 'awaiting_both' && extractedCpfDigits && cpfPrefix) {
              if (extractedCpfDigits === cpfPrefix) {
                // CPF verified! Show shipment details
                log.info('✅ CPF verified in simultaneous mode!');
                
                await supabase
                  .from('conversations')
                  .update({
                    verification_state: 'verified',
                    verification_data: {
                      shipment_id: foundShipment.id,
                      order_number: foundShipment.external_order_number,
                      shipment_data: foundShipment
                    }
                  })
                  .eq('id', payload.conversation_id);

                // Build shipment details message using template
                const shipmentMessage = buildShippingDetails(foundShipment, verificationMessages.after_verified);
                
                await sendWhatsAppMessage(
                  evolutionApiUrl,
                  evolutionApiKey,
                  payload.integration_id,
                  payload.contact_phone,
                  shipmentMessage,
                  supabase,
                  payload.conversation_id
                );

                await supabase.from('messages').insert({
                  conversation_id: payload.conversation_id,
                  tenant_id: payload.tenant_id,
                  sender_type: 'bot',
                  content: shipmentMessage,
                  status: 'sent',
                });

                await supabase.rpc('deduct_tokens', {
                  _tenant_id: payload.tenant_id,
                  _amount: 1,
                  _type: 'ai_message',
                  _description: 'Verificação de entrega: confirmado',
                  _reference_id: payload.conversation_id
                });

                return new Response(JSON.stringify({ 
                  success: true, 
                  action: 'shipping_verified',
                  order_number: foundShipment.external_order_number
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
            
            // Transition based on verification type
            if (verificationType === 'cpf') {
              // CPF verification - use 3 first digits
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'awaiting_shipping_cpf_verification',
                  verification_data: {
                    shipment_id: foundShipment.id,
                    order_number: foundShipment.external_order_number,
                    verification_type: 'cpf',
                    cpf_prefix: cpfPrefix,
                    phone_suffix: phoneSuffix,
                    shipment_data: foundShipment,
                    attempts: 0
                  }
                })
                .eq('id', payload.conversation_id);

              const verificationMessage = verificationMessages.ask_cpf || `✅ Encontrei o envio do pedido #${foundShipment.external_order_number}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe os *3 primeiros dígitos do CPF* cadastrado na entrega.`;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                verificationMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: verificationMessage,
                status: 'sent',
              });

              await supabase.rpc('deduct_tokens', {
                _tenant_id: payload.tenant_id,
                _amount: 1,
                _type: 'ai_message',
                _description: 'Verificação de entrega: solicitação CPF',
                _reference_id: payload.conversation_id
              });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'shipping_verification_cpf_request',
                order_number: foundShipment.external_order_number
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else if (verificationType === 'phone') {
              // Phone verification fallback - use 4 last digits
              log.info('📱 Using phone verification fallback (no CPF available)');
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'awaiting_shipping_phone_verification',
                  verification_data: {
                    shipment_id: foundShipment.id,
                    order_number: foundShipment.external_order_number,
                    verification_type: 'phone',
                    phone_suffix: phoneSuffix,
                    shipment_data: foundShipment,
                    attempts: 0
                  }
                })
                .eq('id', payload.conversation_id);

              const verificationMessage = verificationMessages.ask_phone || `✅ Encontrei o envio do pedido #${foundShipment.external_order_number}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n📱 Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega.`;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                verificationMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: verificationMessage,
                status: 'sent',
              });

              await supabase.rpc('deduct_tokens', {
                _tenant_id: payload.tenant_id,
                _amount: 1,
                _type: 'ai_message',
                _description: 'Verificação de entrega: solicitação telefone',
                _reference_id: payload.conversation_id
              });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'shipping_verification_phone_request',
                order_number: foundShipment.external_order_number
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else {
              // No verification data available - auto-approve
              log.info('⚠️ No CPF or phone in shipment - auto-approving');
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'verified',
                  verification_data: {
                    shipment_id: foundShipment.id,
                    order_number: foundShipment.external_order_number,
                    shipment_data: foundShipment
                  }
                })
                .eq('id', payload.conversation_id);

              // Build shipment details message using template
              const shipmentMessage = buildShippingDetails(foundShipment, verificationMessages.after_verified);
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                shipmentMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: shipmentMessage,
                status: 'sent',
              });

              await supabase.rpc('deduct_tokens', {
                _tenant_id: payload.tenant_id,
                _amount: 1,
                _type: 'ai_message',
                _description: 'Verificação de entrega: auto-aprovado',
                _reference_id: payload.conversation_id
              });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'shipping_auto_verified',
                order_number: foundShipment.external_order_number
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } else {
            // Shipment not found
            const notFoundMessage = replaceMessageVariables(verificationMessages.order_not_found, {
              order_number: extractedOrderNumber
            });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              notFoundMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: notFoundMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de entrega: não encontrado',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'shipment_not_found',
              searched_order: extractedOrderNumber
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // No order number found in message
          const askAgainMessage = verificationMessages.ask_order_number;
          
          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            askAgainMessage,
            supabase,
            payload.conversation_id
          );

          await supabase.from('messages').insert({
            conversation_id: payload.conversation_id,
            tenant_id: payload.tenant_id,
            sender_type: 'bot',
            content: askAgainMessage,
            status: 'sent',
          });

          return new Response(JSON.stringify({ 
            success: true, 
            action: 'shipping_order_number_not_found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // STATE: awaiting_shipping_cpf_verification - Validate CPF prefix (3 first digits)
      if (verificationState === 'awaiting_shipping_cpf_verification' && verificationData) {
        log.info('🔐 Shipping Verification: Awaiting CPF verification...');
        
        // Extract digits from message (looking for 3+ digits)
        const digitsMatch = messageContentForProcessing.replace(/\D/g, '');
        
        if (digitsMatch.length >= 3) {
          const enteredDigits = digitsMatch.substring(0, 3);
          const attempts = (verificationData.attempts || 0) + 1;
          const cpfPrefix = verificationData.cpf_prefix || '';
          
          log.info(`🔐 Comparing CPF: entered=${enteredDigits}, expected=${cpfPrefix}`);
          
          if (enteredDigits === cpfPrefix) {
            // CPF verified!
            log.info('✅ Shipping CPF verified successfully!');
            
            await supabase
              .from('conversations')
              .update({
                verification_state: 'verified',
                verification_data: verificationData
              })
              .eq('id', payload.conversation_id);

            // Build shipment details message using template
            const shipment = verificationData.shipment_data;
            const shipmentMessage = buildShippingDetails(shipment, verificationMessages.after_verified);
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              shipmentMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: shipmentMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de entrega: CPF confirmado',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'shipping_verified',
              order_number: verificationData.order_number
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            // Wrong CPF
            log.info(`❌ Shipping CPF mismatch: entered ${enteredDigits}, expected ${cpfPrefix}`);
            
            if (attempts >= 3) {
              // Max attempts reached - transfer to human
              let targetColumnId = cpfMaxAttemptsColumnId;
              
              if (!targetColumnId) {
                const { data: firstColumn } = await supabase
                  .from('kanban_columns')
                  .select('id')
                  .eq('tenant_id', payload.tenant_id)
                  .order('position', { ascending: true })
                  .limit(1)
                  .single();
                targetColumnId = firstColumn?.id || null;
              }
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: null,
                  verification_data: null,
                  status: 'pending',
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  kanban_column_id: targetColumnId
                })
                .eq('id', payload.conversation_id);

              const maxAttemptsMessage = verificationMessages.cpf_max_attempts;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                maxAttemptsMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: maxAttemptsMessage,
                status: 'sent',
              });

              log.info(`[AI-CHAT] Max shipping CPF attempts reached, transferring to human`);

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'shipping_verification_failed_transfer',
                attempts,
                movedToColumn: targetColumnId
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Update attempts and ask again
            await supabase
              .from('conversations')
              .update({
                verification_data: { ...verificationData, attempts }
              })
              .eq('id', payload.conversation_id);

            const wrongCpfMessage = replaceMessageVariables(verificationMessages.cpf_wrong, {
              attempts,
              order_number: verificationData.order_number || ''
            });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              wrongCpfMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: wrongCpfMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de entrega: CPF incorreto',
              _reference_id: payload.conversation_id
            });

            log.info(`[AI-CHAT] Wrong shipping CPF, asking to retry. Attempt ${attempts}/3`);

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'shipping_cpf_mismatch',
              attempts
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // No valid 3+ digits found - ask again
          const askAgainMessage = `Por favor, informe os *3 primeiros dígitos do CPF* cadastrado na entrega do pedido *#${verificationData.order_number}*.

_Exemplo: se o CPF for 123.456.789-00, digite apenas *123*._`;

          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            askAgainMessage,
            supabase,
            payload.conversation_id
          );

          await supabase.from('messages').insert({
            conversation_id: payload.conversation_id,
            tenant_id: payload.tenant_id,
            sender_type: 'bot',
            content: askAgainMessage,
            status: 'sent',
          });

          log.info('[AI-CHAT] No valid CPF digits found in message, asking again');

          return new Response(JSON.stringify({ 
            success: true, 
            action: 'shipping_cpf_digits_not_found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // STATE: awaiting_shipping_phone_verification - Validate phone suffix (4 last digits)
      if (verificationState === 'awaiting_shipping_phone_verification' && verificationData) {
        log.info('📱 Shipping Verification: Awaiting phone verification...');
        
        // Extract digits from message (looking for 4+ digits)
        const digitsMatch = messageContentForProcessing.replace(/\D/g, '');
        
        if (digitsMatch.length >= 4) {
          const enteredDigits = digitsMatch.slice(-4); // Last 4 digits
          const attempts = (verificationData.attempts || 0) + 1;
          const phoneSuffix = verificationData.phone_suffix || '';
          
          log.info(`📱 Comparing phone: entered=${enteredDigits}, expected=${phoneSuffix}`);
          
          if (enteredDigits === phoneSuffix) {
            // Phone verified!
            log.info('✅ Shipping phone verified successfully!');
            
            await supabase
              .from('conversations')
              .update({
                verification_state: 'verified',
                verification_data: verificationData
              })
              .eq('id', payload.conversation_id);

            // Build shipment details message using template
            const shipment = verificationData.shipment_data;
            const shipmentMessage = buildShippingDetails(shipment, verificationMessages.after_verified);
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              shipmentMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: shipmentMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de entrega: telefone confirmado',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'shipping_verified_by_phone',
              order_number: verificationData.order_number
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            // Wrong phone
            log.info(`❌ Shipping phone mismatch: entered ${enteredDigits}, expected ${phoneSuffix}`);
            
            if (attempts >= 3) {
              // Max attempts reached - transfer to human
              let targetColumnId = cpfMaxAttemptsColumnId;
              
              if (!targetColumnId) {
                const { data: firstColumn } = await supabase
                  .from('kanban_columns')
                  .select('id')
                  .eq('tenant_id', payload.tenant_id)
                  .order('position', { ascending: true })
                  .limit(1)
                  .single();
                targetColumnId = firstColumn?.id || null;
              }
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: null,
                  verification_data: null,
                  status: 'pending',
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  kanban_column_id: targetColumnId
                })
                .eq('id', payload.conversation_id);

              const maxAttemptsMessage = verificationMessages.max_attempts || verificationMessages.cpf_max_attempts;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                maxAttemptsMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: maxAttemptsMessage,
                status: 'sent',
              });

              log.info(`[AI-CHAT] Max shipping phone attempts reached, transferring to human`);

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'shipping_verification_failed_transfer',
                attempts,
                movedToColumn: targetColumnId
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Update attempts and ask again
            await supabase
              .from('conversations')
              .update({
                verification_data: { ...verificationData, attempts }
              })
              .eq('id', payload.conversation_id);

            const wrongPhoneMessage = replaceMessageVariables(verificationMessages.phone_wrong, { attempts: String(attempts) });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              wrongPhoneMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: wrongPhoneMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de entrega: telefone incorreto',
              _reference_id: payload.conversation_id
            });

            log.info(`[AI-CHAT] Wrong shipping phone, asking to retry. Attempt ${attempts}/3`);

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'shipping_phone_mismatch',
              attempts
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // No valid 4+ digits found - ask again
          const askAgainMessage = `Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega do pedido *#${verificationData.order_number}*.

_Exemplo: se o telefone for (11) 98765-4321, digite apenas *4321*._`;

          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            askAgainMessage,
            supabase,
            payload.conversation_id
          );

          await supabase.from('messages').insert({
            conversation_id: payload.conversation_id,
            tenant_id: payload.tenant_id,
            sender_type: 'bot',
            content: askAgainMessage,
            status: 'sent',
          });

          log.info('[AI-CHAT] No valid phone digits found in message, asking again');

          return new Response(JSON.stringify({ 
            success: true, 
            action: 'shipping_phone_digits_not_found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ========== ORDER VERIFICATION FLOW ==========
    if (hasOrderVerification && aiAgent && storeInfo) {
      // STATE: awaiting_order_number - Extract order number from message
      if (verificationState === 'awaiting_order_number') {
        log.info('📦 Verification: Awaiting order number...');
        
        // Extract order number from message
        const orderNumberPatterns = [
          /pedido[:\s#]*(\d{3,})/gi,
          /n[uú]mero[:\s#]*(\d{3,})/gi,
          /#(\d{4,})/g,
          /\b(\d{4,10})\b/g
        ];
        
        let extractedOrderNumber: string | null = null;
        for (const pattern of orderNumberPatterns) {
          const matches = messageContentForProcessing.matchAll(pattern);
          for (const match of matches) {
            if (match[1]) {
              extractedOrderNumber = match[1];
              break;
            }
          }
          if (extractedOrderNumber) break;
        }

        if (extractedOrderNumber) {
          log.info(`📦 Extracted order number: ${extractedOrderNumber}, searching in ${storeInfo.tables.orders}`);
          log.info(`📦 Query: ${storeInfo.tables.orders} WHERE tenant_id=${payload.tenant_id} AND integration_id=${storeInfo.integrationId} AND numero=${extractedOrderNumber}`);
          
          // Search for the order in the correct table - INCLUDE integration_id filter!
          const { data: foundOrder, error: searchError } = await supabase
            .from(storeInfo.tables.orders)
            .select(getStoreColumns(storeInfo.tables.orders))
            .eq('tenant_id', payload.tenant_id)
            .eq('integration_id', storeInfo.integrationId)
            .eq('numero', extractedOrderNumber)
            .maybeSingle();
          
          if (searchError) {
            log.error('❌ Order search error:', searchError);
          }

          if (foundOrder) {
            log.info(`✅ Order found: #${foundOrder.numero}`);
            
            // Get CPF from order using dynamic field
            let orderCpf = getOrderCpf(foundOrder, storeInfo);
            
            // If no CPF in order, try to find customer
            if (!orderCpf && foundOrder.cliente_telefone) {
              const phoneDigits = foundOrder.cliente_telefone.replace(/\D/g, '').slice(-9);
              const { data: customer } = await supabase
                .from(storeInfo.tables.customers)
                .select(getStoreColumns(storeInfo.tables.customers))
                .eq('tenant_id', payload.tenant_id)
                .ilike(storeInfo.fields.customerPhone, `%${phoneDigits}%`)
                .maybeSingle();
              if (customer) {
                const typedCustomer = customer as CustomerRow;
                const cpfValue = storeInfo.type === 'bling' 
                  ? typedCustomer.cpf_cnpj 
                  : typedCustomer.cpf;
                orderCpf = cpfValue?.replace(/\D/g, '') || '';
              }
            }

            if (orderCpf && orderCpf.length >= 3) {
              // Save order data and transition to CPF verification
              const cpfPrefix = orderCpf.substring(0, 3);
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'awaiting_cpf_verification',
                  verification_data: {
                    order_id: foundOrder.id,
                    order_number: foundOrder.numero,
                    cpf_prefix: cpfPrefix,
                    order_data: foundOrder,
                    attempts: 0
                  }
                })
                .eq('id', payload.conversation_id);

              // Send CPF verification request
              const verificationMessage = `✅ Encontrei o pedido #${foundOrder.numero}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe os *3 primeiros dígitos do CPF* cadastrado neste pedido.`;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                verificationMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: verificationMessage,
                status: 'sent',
              });

              // Deduct token
              await supabase.rpc('deduct_tokens', {
                _tenant_id: payload.tenant_id,
                _amount: 1,
                _type: 'ai_message',
                _description: 'Verificação de pedido: solicitação CPF',
                _reference_id: payload.conversation_id
              });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'order_verification_cpf_request',
                order_number: foundOrder.numero
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else {
              // Order found but no CPF to verify - ask for CPF to confirm identity
              log.info('⚠️ Order found but no CPF in order - asking customer for CPF');
              
              // Ask customer to provide their CPF for verification
              const askCpfMessage = `✅ Encontrei o pedido #${foundOrder.numero}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe o *CPF* cadastrado neste pedido.`;
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'awaiting_cpf_full',
                  verification_data: {
                    order_id: foundOrder.id,
                    order_number: foundOrder.numero,
                    order_data: foundOrder,
                    attempts: 0
                  }
                })
                .eq('id', payload.conversation_id);
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                askCpfMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: askCpfMessage,
                status: 'sent',
              });

              await supabase.rpc('deduct_tokens', {
                _tenant_id: payload.tenant_id,
                _amount: 1,
                _type: 'ai_message',
                _description: 'Verificação de pedido: solicitação CPF completo',
                _reference_id: payload.conversation_id
              });

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'order_verification_cpf_full_request',
                order_number: foundOrder.numero
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: 'verified',
                  verification_data: {
                    order_id: foundOrder.id,
                    order_number: foundOrder.numero,
                    order_data: foundOrder
                  }
                })
                .eq('id', payload.conversation_id);
              // Continue to AI processing with verified order
            }
          } else {
            // Order not found - use configured message
            const notFoundMessage = replaceMessageVariables(verificationMessages.order_not_found, {
              order_number: extractedOrderNumber
            });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              notFoundMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: notFoundMessage,
              status: 'sent',
            });

            // If configured, move to specific column
            if (orderNotFoundColumnId) {
              await supabase
                .from('conversations')
                .update({
                  kanban_column_id: orderNotFoundColumnId,
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  verification_state: null
                })
                .eq('id', payload.conversation_id);
              log.info(`📦 Order not found - moved to column: ${orderNotFoundColumnId}`);
            }

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de pedido: não encontrado',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'order_not_found',
              searched_number: extractedOrderNumber,
              movedToColumn: orderNotFoundColumnId
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        // If no order number found in message, continue to AI to ask again
      }

      // STATE: awaiting_cpf_verification - Validate CPF prefix
      if (verificationState === 'awaiting_cpf_verification' && verificationData) {
        log.info('🔐 Verification: Awaiting CPF confirmation...');
        
        // Extract 3 digits from message
        const digitsMatch = messageContentForProcessing.replace(/\D/g, '');
        const enteredDigits = digitsMatch.substring(0, 3);
        
        if (enteredDigits.length >= 3) {
          const attempts = (verificationData.attempts || 0) + 1;
          
          if (enteredDigits === verificationData.cpf_prefix) {
            // CPF verified! Transition to verified state
            log.info('✅ CPF verified successfully!');
            
            // Move to afterVerifiedColumnId if configured
            const updateData: Record<string, unknown> = {
              verification_state: 'verified',
              verification_data: verificationData
            };
            if (afterVerifiedColumnId) {
              updateData.kanban_column_id = afterVerifiedColumnId;
              log.info(`📋 Moving conversation to after-verified column: ${afterVerifiedColumnId}`);
            }
            
            await supabase
              .from('conversations')
              .update(updateData)
              .eq('id', payload.conversation_id);

            // Build order info message
            const order = verificationData.order_data;
            const createdDate = order?.data_criacao 
              ? new Date(order.data_criacao).toLocaleDateString('pt-BR') 
              : 'Data não informada';
            
            // Get order items using the correct table
            let itemsList = '';
            if (order?.id && storeInfo) {
              const { data: orderItems } = await supabase
                .from(storeInfo.tables.orderItems)
                .select(getStoreColumns(storeInfo.tables.orderItems))
                .eq('order_id', order.id);
              
              if (orderItems && orderItems.length > 0) {
                itemsList = (orderItems as OrderItemRow[]).map((i) => `  • ${i.quantidade}x ${i.produto_nome}`).join('\n');
              }
            }

            // Get tracking code dynamically
            const trackingCode = storeInfo ? getTrackingCode(order, storeInfo) : (order?.codigo_rastreio || 'Ainda não disponível');
            
            const verifiedMessage = `✅ *Identidade confirmada!*\n\n📦 *Pedido #${order?.numero}*\n📅 Data: ${createdDate}\n👤 Cliente: ${order?.cliente_nome || 'Não informado'}\n\n📊 *Status:* ${order?.situacao_nome || 'Não informado'}\n💰 *Valor Total:* R$ ${order?.valor_total?.toFixed(2) || '0,00'}\n💳 *Pagamento:* ${order?.forma_pagamento || 'Não informado'}\n🚚 *Frete:* R$ ${order?.valor_frete?.toFixed(2) || '0,00'} (${order?.forma_envio || 'Não informado'})\n📍 *Entrega:* ${order?.endereco_entrega_cidade || 'Não informado'}/${order?.endereco_entrega_estado || ''}\n📦 *Rastreio:* ${trackingCode || 'Ainda não disponível'}${itemsList ? `\n\n🛒 *Itens:*\n${itemsList}` : ''}\n\nPosso ajudar com mais alguma coisa? 😊`;
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              verifiedMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: verifiedMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de pedido: confirmada',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'order_verified',
              order_number: verificationData.order_number
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            // Wrong CPF
            log.info(`❌ CPF mismatch: entered ${enteredDigits}, expected ${verificationData.cpf_prefix}`);
            
            if (attempts >= 3) {
              // Max attempts reached - transfer to human using configured column or fallback to first
              let targetColumnId = cpfMaxAttemptsColumnId;
              
              if (!targetColumnId) {
                // Fallback: Find the first Kanban column (position 0)
                const { data: firstColumn } = await supabase
                  .from('kanban_columns')
                  .select('id')
                  .eq('tenant_id', payload.tenant_id)
                  .order('position', { ascending: true })
                  .limit(1)
                  .single();
                targetColumnId = firstColumn?.id || null;
              }
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: null,
                  verification_data: null,
                  status: 'pending',
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  kanban_column_id: targetColumnId
                })
                .eq('id', payload.conversation_id);

              // Use configured message
              const maxAttemptsMessage = verificationMessages.cpf_max_attempts;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                maxAttemptsMessage,
                supabase,
                payload.conversation_id
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: maxAttemptsMessage,
                status: 'sent',
              });

              log.info(`[AI-CHAT] Max CPF attempts reached, transferring to human and moving to column: ${targetColumnId}`);

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'verification_failed_transfer',
                attempts,
                movedToColumn: targetColumnId
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Update attempts and ask again
            await supabase
              .from('conversations')
              .update({
                verification_data: { ...verificationData, attempts }
              })
              .eq('id', payload.conversation_id);

            // Use configured message with variables
            const wrongCpfMessage = replaceMessageVariables(verificationMessages.cpf_wrong, {
              attempts,
              order_number: verificationData.order_number || ''
            });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              wrongCpfMessage,
              supabase,
              payload.conversation_id
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: wrongCpfMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de pedido: CPF incorreto',
              _reference_id: payload.conversation_id
            });

            log.info(`[AI-CHAT] Wrong CPF, asking to retry. Attempt ${attempts}/3`);

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'cpf_mismatch',
              attempts
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // No valid 3+ digits found - ask again with example
          const askAgainMessage = `Por favor, informe apenas os *3 primeiros dígitos* do CPF cadastrado no pedido *#${verificationData.order_number}* para que eu possa liberar as informações.

_Exemplo: se o CPF for 123.456.789-00, digite apenas *123*._`;

          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            askAgainMessage,
            supabase,
            payload.conversation_id
          );

          await supabase.from('messages').insert({
            conversation_id: payload.conversation_id,
            tenant_id: payload.tenant_id,
            sender_type: 'bot',
            content: askAgainMessage,
            status: 'sent',
          });

          log.info('[AI-CHAT] No valid CPF digits found in message, asking again');

          return new Response(JSON.stringify({ 
            success: true, 
            action: 'cpf_digits_not_found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // STATE: awaiting_cpf_full - Validate FULL CPF (11 digits)
      if (verificationState === 'awaiting_cpf_full' && verificationData) {
        log.info('🔐 Verification: Awaiting full CPF...');
        
        // Extract digits from message
        const digitsMatch = messageContentForProcessing.replace(/\D/g, '');
        
        if (digitsMatch.length >= 11) {
          const enteredCpf = digitsMatch.substring(0, 11);
          const attempts = (verificationData.attempts || 0) + 1;
          
          // Get stored CPF from order data
          const orderData = verificationData.order_data;
          const orderCpf = (orderData?.cliente_cpf_cnpj || orderData?.cpf || '').replace(/\D/g, '');
          
          log.info(`🔐 Comparing full CPF: entered=${enteredCpf}, order=${orderCpf}`);
          
          if (enteredCpf === orderCpf) {
            // CPF verified! Transition to verified state
            log.info('✅ Full CPF verified successfully!');
            
            // Move to afterVerifiedColumnId if configured
            const updateData: Record<string, unknown> = {
              verification_state: 'verified',
              verification_data: verificationData
            };
            if (afterVerifiedColumnId) {
              updateData.kanban_column_id = afterVerifiedColumnId;
              log.info(`📋 Moving conversation to after-verified column: ${afterVerifiedColumnId}`);
            }
            
            await supabase
              .from('conversations')
              .update(updateData)
              .eq('id', payload.conversation_id);

            // Build order info message
            const order = verificationData.order_data;
            const createdDate = order?.data_criacao 
              ? new Date(order.data_criacao).toLocaleDateString('pt-BR') 
              : 'Data não informada';
            
            // Get order items using the correct table
            let itemsList = '';
            if (order?.id && storeInfo) {
              const { data: orderItems } = await supabase
                .from(storeInfo.tables.orderItems)
                .select(getStoreColumns(storeInfo.tables.orderItems))
                .eq('order_id', order.id);
              
              if (orderItems && orderItems.length > 0) {
                itemsList = (orderItems as OrderItemRow[]).map((i) => `  • ${i.quantidade}x ${i.produto_nome}`).join('\n');
              }
            }

            // Get tracking code dynamically
            const trackingCode = storeInfo ? getTrackingCode(order, storeInfo) : (order?.codigo_rastreio || 'Ainda não disponível');
            
            const verifiedMessage = `✅ *Identidade confirmada!*\n\n📦 *Pedido #${order?.numero}*\n📅 Data: ${createdDate}\n👤 Cliente: ${order?.cliente_nome || 'Não informado'}\n\n📊 *Status:* ${order?.situacao_nome || 'Não informado'}\n💰 *Valor Total:* R$ ${order?.valor_total?.toFixed(2) || '0,00'}\n💳 *Pagamento:* ${order?.forma_pagamento || 'Não informado'}\n🚚 *Frete:* R$ ${order?.valor_frete?.toFixed(2) || '0,00'} (${order?.forma_envio || 'Não informado'})\n📍 *Entrega:* ${order?.endereco_entrega_cidade || 'Não informado'}/${order?.endereco_entrega_estado || ''}\n📦 *Rastreio:* ${trackingCode || 'Ainda não disponível'}${itemsList ? `\n\n🛒 *Itens:*\n${itemsList}` : ''}\n\nPosso ajudar com mais alguma coisa? 😊`;
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              verifiedMessage,
              supabase
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: verifiedMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de pedido: CPF completo confirmado',
              _reference_id: payload.conversation_id
            });

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'order_verified_cpf_full',
              order_number: verificationData.order_number
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            // Wrong CPF
            log.info(`❌ Full CPF mismatch: entered ${enteredCpf}, expected ${orderCpf}`);
            
            if (attempts >= 3) {
              // Max attempts reached - transfer to human
              let targetColumnId = cpfMaxAttemptsColumnId;
              
              if (!targetColumnId) {
                const { data: firstColumn } = await supabase
                  .from('kanban_columns')
                  .select('id')
                  .eq('tenant_id', payload.tenant_id)
                  .order('position', { ascending: true })
                  .limit(1)
                  .single();
                targetColumnId = firstColumn?.id || null;
              }
              
              await supabase
                .from('conversations')
                .update({
                  verification_state: null,
                  verification_data: null,
                  status: 'pending',
                  ai_enabled: false,
                  current_ai_agent_id: null,
                  kanban_column_id: targetColumnId
                })
                .eq('id', payload.conversation_id);

              const maxAttemptsMessage = verificationMessages.cpf_max_attempts;
              
              await sendWhatsAppMessage(
                evolutionApiUrl,
                evolutionApiKey,
                payload.integration_id,
                payload.contact_phone,
                maxAttemptsMessage,
                supabase
              );

              await supabase.from('messages').insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: maxAttemptsMessage,
                status: 'sent',
              });

              log.info(`[AI-CHAT] Max full CPF attempts reached, transferring to human`);

              return new Response(JSON.stringify({ 
                success: true, 
                action: 'verification_failed_transfer_cpf_full',
                attempts,
                movedToColumn: targetColumnId
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Update attempts and ask again
            await supabase
              .from('conversations')
              .update({
                verification_data: { ...verificationData, attempts }
              })
              .eq('id', payload.conversation_id);

            const wrongCpfMessage = replaceMessageVariables(verificationMessages.cpf_wrong, {
              attempts,
              order_number: verificationData.order_number || ''
            });
            
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              wrongCpfMessage,
              supabase
            );

            await supabase.from('messages').insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: wrongCpfMessage,
              status: 'sent',
            });

            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'Verificação de pedido: CPF completo incorreto',
              _reference_id: payload.conversation_id
            });

            log.info(`[AI-CHAT] Wrong full CPF, asking to retry. Attempt ${attempts}/3`);

            return new Response(JSON.stringify({ 
              success: true, 
              action: 'cpf_full_mismatch',
              attempts
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // Not enough digits - ask again
          const askAgainMessage = `Por favor, informe o *CPF completo* (11 dígitos) cadastrado no pedido *#${verificationData.order_number}* para que eu possa liberar as informações.

_Exemplo: 123.456.789-00 ou apenas os números: 12345678900_`;

          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            askAgainMessage,
            supabase
          );

          await supabase.from('messages').insert({
            conversation_id: payload.conversation_id,
            tenant_id: payload.tenant_id,
            sender_type: 'bot',
            content: askAgainMessage,
            status: 'sent',
          });

          log.info('[AI-CHAT] No valid full CPF found in message, asking again');

          return new Response(JSON.stringify({ 
            success: true, 
            action: 'cpf_full_digits_not_found'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ========== END ORDER VERIFICATION FLOW ==========

    // Check for agent-to-agent transfer keywords FIRST
    const agentTransferRules: AgentTransferRule[] = aiAgent?.agent_transfer_rules || [];
    const messageText = messageContentForProcessing.toLowerCase();
    
    for (const rule of agentTransferRules) {
      const matchesKeyword = rule.keywords.some(keyword => 
        messageText.includes(keyword.toLowerCase())
      );
      
      if (matchesKeyword && rule.target_agent_id) {
        // Fetch the target agent
        const { data: targetAgent } = await supabase
          .from('ai_agents')
          .select(AI_AGENT_COLUMNS)
          .eq('id', rule.target_agent_id)
          .eq('is_active', true)
          .single();
        
        if (targetAgent) {
          log.info(`🔄 Transferring from "${aiAgent?.name}" to AI agent: "${targetAgent.name}"`);
          
          // Update conversation with new current AI agent
          await supabase
            .from('conversations')
            .update({ current_ai_agent_id: targetAgent.id })
            .eq('id', payload.conversation_id);
          
          // Send transfer message
          const transferMessage = `Entendi! Vou transferir você para ${targetAgent.name}. Um momento... 🔄`;
          
          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            transferMessage,
            supabase
          );
          
          // Save transfer message
          await supabase
            .from('messages')
            .insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: transferMessage,
              status: 'sent',
            });
          
          // Switch to the new agent and continue processing
          aiAgent = targetAgent;
          log.info(`✅ Switched to agent: ${aiAgent.name}`);
          
          // Send welcome message from new agent if configured
          if (targetAgent.welcome_message) {
            await sendWhatsAppMessage(
              evolutionApiUrl,
              evolutionApiKey,
              payload.integration_id,
              payload.contact_phone,
              targetAgent.welcome_message,
              supabase
            );
            
            await supabase
              .from('messages')
              .insert({
                conversation_id: payload.conversation_id,
                tenant_id: payload.tenant_id,
                sender_type: 'bot',
                content: targetAgent.welcome_message,
                status: 'sent',
              });
          }
          
          // Don't break - we'll continue with the new agent to answer the question
          break;
        }
      }
    }

    // Check for keyword action rules BEFORE transfer keywords
    const keywordActionRules: KeywordActionRule[] = aiAgent?.keyword_action_rules || [];
    
    for (const rule of keywordActionRules) {
      const matchesKeyword = rule.keywords.some(keyword => 
        messageText.includes(keyword.toLowerCase())
      );
      
      if (matchesKeyword) {
        log.info(`⚡ Keyword action rule triggered: ${rule.action_type} for keywords: ${rule.keywords.join(', ')}`);
        
        let responseSent = false;
        
        // Send response message if configured
        if ((rule.action_type === 'send_response' || rule.action_type === 'send_and_move') && rule.response_message) {
          await sendWhatsAppMessage(
            evolutionApiUrl,
            evolutionApiKey,
            payload.integration_id,
            payload.contact_phone,
            rule.response_message,
            supabase
          );
          
          // Save bot message
          await supabase
            .from('messages')
            .insert({
              conversation_id: payload.conversation_id,
              tenant_id: payload.tenant_id,
              sender_type: 'bot',
              content: rule.response_message,
              status: 'sent',
            });
          
          responseSent = true;
          log.info('📤 Keyword action response sent');
        }
        
        // Move to column if configured
        if ((rule.action_type === 'move_column' || rule.action_type === 'send_and_move') && rule.target_column_id) {
          await supabase
            .from('conversations')
            .update({ kanban_column_id: rule.target_column_id })
            .eq('id', payload.conversation_id);
          
          log.info(`📋 Conversation moved to column: ${rule.target_column_id}`);
        }
        
        // Return early if we sent a response (skip AI processing for this message)
        if (responseSent) {
          return new Response(JSON.stringify({ 
            success: true, 
            action: 'keyword_action_rule',
            rule_type: rule.action_type,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // For move_column only action, continue to AI processing
        break;
      }
    }

    // Check for transfer to human keywords
    const transferKeywords = aiAgent?.transfer_keywords || aiConfig.transfer_keywords || ['atendente', 'humano', 'pessoa'];
    const shouldTransfer = transferKeywords.some((keyword: string) => 
      messageText.includes(keyword.toLowerCase())
    );

    if (shouldTransfer) {
      log.info('🔄 Transfer to human requested via keywords');
      
      // Get target column from agent config
      const targetColumnId = aiAgent?.human_transfer_column_id;
      log.info(`📋 Target column for transfer: ${targetColumnId || 'keep current'}`);
      
      // Clear current AI agent and update conversation status
      await supabase
        .from('conversations')
        .update({ 
          status: 'pending',
          ai_enabled: false,
          current_ai_agent_id: null,
          ...(targetColumnId && { kanban_column_id: targetColumnId }),
        })
        .eq('id', payload.conversation_id);

      // Send transfer message
      const transferMessage = 'Entendi! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor. 🙋';
      
      await sendWhatsAppMessage(
        evolutionApiUrl,
        evolutionApiKey,
        payload.integration_id,
        payload.contact_phone,
        transferMessage,
        supabase
      );

      // Save bot message
      await supabase
        .from('messages')
        .insert({
          conversation_id: payload.conversation_id,
          tenant_id: payload.tenant_id,
          sender_type: 'bot',
          content: transferMessage,
          status: 'sent',
        });

      return new Response(JSON.stringify({ 
        success: true, 
        transferred: true,
        message: transferMessage 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get data access configuration from agent or use defaults with backward compatibility
    const rawDataAccess = aiAgent?.data_access || {};
    const dataAccess: Required<DataAccess> = {
      customer_details: rawDataAccess.customer_details ?? true,
      orders: rawDataAccess.orders ?? true,
      order_items: rawDataAccess.order_items ?? rawDataAccess.orders ?? true,
      order_tracking: rawDataAccess.order_tracking ?? rawDataAccess.orders ?? true,
      products: rawDataAccess.products ?? false,
      products_featured: rawDataAccess.products_featured ?? rawDataAccess.products ?? false,
      products_catalog: rawDataAccess.products_catalog ?? false,
      coupons: rawDataAccess.coupons ?? true,
      cashback: rawDataAccess.cashback ?? false,
      smart_search: rawDataAccess.smart_search ?? true,
    };

    log.info('📊 Data access config:', dataAccess);

    // ========== BUILD ENRICHED CONTEXT (extracted to _shared/ai-chat-context.ts) ==========
    const enrichedCtx = await buildEnrichedContext({
      supabase,
      tenantId: payload.tenant_id,
      contactPhone: payload.contact_phone,
      storeInfo,
      dataAccess,
      messageHistory,
      contactLiCustomerId: conversation.contact?.li_customer_id,
    });

    const {
      extractedDataContext, specificOrderInfo, customerInfo, ordersInfo,
      couponsInfo, cashbackInfo, productsInfo,
    } = enrichedCtx;

    // Build system prompt - use agent's prompt if available, otherwise global
    const defaultSystemPrompt = `Você é um assistente virtual amigável e prestativo de uma loja online. 
Responda de forma cordial, objetiva e profissional.
Use emojis com moderação para tornar a conversa mais amigável.
Se não souber responder algo, peça desculpas e sugira falar com um atendente humano.
Nunca invente informações sobre pedidos ou produtos.
Mantenha as respostas concisas (máximo 3-4 frases quando possível).`;

    const systemPrompt = aiAgent?.system_prompt || aiConfig.system_prompt || defaultSystemPrompt;
    log.info(`📝 Using system_prompt from: ${aiAgent?.system_prompt ? 'AI Agent (' + aiAgent.name + ')' : (aiConfig.system_prompt ? 'Global Config' : 'Default Fallback')}`);

    const fullSystemPrompt = `${systemPrompt}

${extractedDataContext}
${specificOrderInfo}
${customerInfo}
${ordersInfo}
${couponsInfo}
${cashbackInfo}
${productsInfo}

Contexto: Você está respondendo via WhatsApp. O cliente se chama ${conversation.contact?.name || 'Cliente'}.

INSTRUÇÕES IMPORTANTES:
1. Se houver um "PEDIDO SOLICITADO" acima, PRIORIZE responder sobre ele com os dados reais do sistema.
2. NUNCA invente informações. Use APENAS os dados fornecidos acima.
3. Se o cliente perguntar sobre um pedido e você não encontrar, peça o número do pedido correto.
4. Combine informações de mensagens anteriores para entender o contexto (o cliente pode enviar nome, CPF e pedido em mensagens separadas).
`;

    // Build conversation messages for AI
    const aiMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...messageHistory.map(m => ({
        role: m.sender_type === 'contact' ? 'user' : 'assistant',
        content: m.content,
      })),
    ];

    // Get AI config for this tenant (to determine default model)
    const aiConfig2 = await getAIConfig(supabase, payload.tenant_id);
    
    // Get AI parameters - prefer agent settings, fallback to defaults
    const model = aiAgent?.model || aiConfig2.defaultModel;
    const temperature = aiAgent?.temperature ?? 0.7;
    const maxTokens = aiAgent?.max_tokens ?? 500;

    log.info(`🧠 Calling AI with model: ${model}, temp: ${temperature}, agent: ${aiAgent?.name || 'global'}`);

    // Call AI with automatic fallback between providers
    const aiResult = await callAIWithFallback(
      supabase,
      payload.tenant_id,
      aiMessages,
      model,
      temperature,
      maxTokens,
      aiAgent?.id,
      payload.conversation_id,
      aiAgent?.ai_provider || null
    );

    if (!aiResult.success) {
      if (aiResult.error === 'no_ai_provider') {
        log.error('❌ No AI provider configured for tenant');
        // Send message to contact informing AI is not configured
        await sendWhatsAppMessage(
          evolutionApiUrl,
          evolutionApiKey,
          payload.integration_id,
          payload.contact_phone,
          'Desculpe, nosso atendimento automático está temporariamente indisponível. Em breve um atendente humano irá ajudá-lo.',
          supabase,
          payload.conversation_id
        );
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'NO_AI_PROVIDER',
          message: 'Nenhum provedor de IA configurado. Configure uma integração de IA nas configurações.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      log.error('❌ All AI providers failed:', aiResult.error);
      throw new Error(`Todos os provedores de IA falharam: ${aiResult.error}`);
    }

    const botReply = aiResult.data?.choices?.[0]?.message?.content;

    if (!botReply) {
      throw new Error('No response from AI');
    }

    // Extract token usage from response
    const tokensInput = aiResult.data?.usage?.prompt_tokens || 0;
    const tokensOutput = aiResult.data?.usage?.completion_tokens || 0;

    log.info(`🤖 AI response via ${aiResult.provider} (${tokensInput}+${tokensOutput} tokens):`, botReply.substring(0, 100) + '...');

    // Check token balance before sending (1 token required)
    const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { 
      _tenant_id: payload.tenant_id, 
      _amount: 1 
    });

    if (!hasTokens) {
      log.warn('⚠️ Insufficient tokens for AI message, skipping WhatsApp send');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'INSUFFICIENT_TOKENS',
        message: 'Tokens insuficientes para enviar mensagem automática'
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send response via WhatsApp
    const messageSent = await sendWhatsAppMessage(
      evolutionApiUrl,
      evolutionApiKey,
      payload.integration_id,
      payload.contact_phone,
      botReply,
      supabase,
      payload.conversation_id
    );

    if (!messageSent) {
      log.error('❌ Failed to send AI response to WhatsApp');
    } else {
      // Deduct 1 token for AI message sent
      log.info(`💰 Attempting to deduct 1 token for AI message - tenant: ${payload.tenant_id}`);
      const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
        _tenant_id: payload.tenant_id,
        _amount: 1,
        _type: 'ai_message',
        _description: 'Mensagem de IA enviada',
        _reference_id: payload.conversation_id
      });

      if (deductError) {
        log.error('❌ Error calling deduct_tokens RPC:', deductError);
      } else if (!deducted) {
        log.warn('⚠️ deduct_tokens returned false - possibly insufficient tokens');
      } else {
        log.info('✅ 1 token deducted for AI message');
      }
    }

    // Send interactive buttons if the agent has them configured
    let buttonsSent = false;
    if (aiAgent?.interactive_buttons && (aiAgent.interactive_buttons as InteractiveButton[]).length > 0) {
      const buttons = aiAgent.interactive_buttons as InteractiveButton[];
      
      // Check tokens for buttons
      const { data: hasButtonTokens } = await supabase.rpc('has_enough_tokens', { 
        _tenant_id: payload.tenant_id, 
        _amount: 1 
      });

      if (hasButtonTokens) {
        buttonsSent = await sendWhatsAppButtons(
          evolutionApiUrl,
          evolutionApiKey,
          payload.integration_id,
          payload.contact_phone,
          aiAgent.name,
          'Posso ajudar com mais alguma coisa?',
          buttons,
          supabase
        );
        
        if (buttonsSent) {
          // Deduct token for buttons
          log.info(`💰 Deducting 1 token for AI buttons...`);
          await supabase.rpc('deduct_tokens', {
            _tenant_id: payload.tenant_id,
            _amount: 1,
            _type: 'ai_message',
            _description: 'IA: botões interativos',
            _reference_id: payload.conversation_id
          });
        }
      } else {
        log.warn('⚠️ No tokens for AI buttons');
      }
      
      // If buttons failed, send a text fallback with the options
      if (!buttonsSent) {
        log.info('⚠️ Buttons failed, sending text fallback');
        const buttonLabels = buttons.map((b, i) => `${i + 1}. ${b.display_text}`).join('\n');
        const fallbackMessage = `Posso ajudar com mais alguma coisa?\n\n${buttonLabels}`;
        
        // Check tokens for fallback
        const { data: hasFallbackTokens } = await supabase.rpc('has_enough_tokens', { 
          _tenant_id: payload.tenant_id, 
          _amount: 1 
        });

        if (hasFallbackTokens) {
        const fallbackSent = await sendWhatsAppMessage(
          evolutionApiUrl,
          evolutionApiKey,
          payload.integration_id,
          payload.contact_phone,
          fallbackMessage,
          supabase,
          payload.conversation_id
        );
          
          if (fallbackSent) {
            // Deduct token for fallback
            log.info(`💰 Deducting 1 token for AI buttons fallback...`);
            await supabase.rpc('deduct_tokens', {
              _tenant_id: payload.tenant_id,
              _amount: 1,
              _type: 'ai_message',
              _description: 'IA: fallback botões (texto)',
              _reference_id: payload.conversation_id
            });
          }
        }
      }
    }

    // Save bot message - status depends on whether WhatsApp delivery succeeded
    const messageStatus = messageSent ? 'sent' : 'failed';
    const { data: botMessage } = await supabase
      .from('messages')
      .insert({
        conversation_id: payload.conversation_id,
        tenant_id: payload.tenant_id,
        sender_type: 'bot',
        content: botReply,
        status: messageStatus,
      })
      .select()
      .single();

    // Update conversation
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', payload.conversation_id);

    return new Response(JSON.stringify({ 
      success: true, 
      message_id: botMessage?.id,
      response: botReply,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: { tokens_input: tokensInput, tokens_output: tokensOutput }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    log.error('❌ AI Chat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// sendWhatsAppMessage and sendWhatsAppButtons are now imported from _shared/ai-chat-whatsapp.ts
