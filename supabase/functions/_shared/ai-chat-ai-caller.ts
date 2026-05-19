import { sendWhatsAppMessage, sendWhatsAppButtons, type InteractiveButton } from "./ai-chat-whatsapp.ts";
import { getAIConfig, callAIWithFallback } from "./ai-chat-providers.ts";
import { buildEnrichedContext, type DataAccess } from "./ai-chat-context.ts";
import type { StoreIntegrationInfo } from "./ai-chat-store.ts";

interface AICallerOpts {
  supabase: any;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  conversationId: string;
  tenantId: string;
  integrationId: string;
  contactPhone: string;
  storeInfo: StoreIntegrationInfo | null;
  aiAgent: any;
  aiConfig: any;
  conversation: any;
  messageHistory: any[];
  corsHeaders: Record<string, string>;
  log: any;
}

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente virtual amigável e prestativo de uma loja online.
Responda de forma cordial, objetiva e profissional.
Use emojis com moderação para tornar a conversa mais amigável.
Se não souber responder algo, peça desculpas e sugira falar com um atendente humano.
Nunca invente informações sobre pedidos ou produtos.
Mantenha as respostas concisas (máximo 3-4 frases quando possível).`;

/** Perform the full AI call pipeline: enrich context → call AI → send WA → save message. */
export async function callAI(opts: AICallerOpts): Promise<Response> {
  const { supabase, evolutionApiUrl, evolutionApiKey, conversationId, tenantId, integrationId, contactPhone, storeInfo, aiAgent, aiConfig, conversation, messageHistory, corsHeaders, log } = opts;

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

  const enrichedCtx = await buildEnrichedContext({
    supabase,
    tenantId,
    contactPhone,
    storeInfo,
    dataAccess,
    messageHistory,
    contactLiCustomerId: conversation.contact?.li_customer_id,
  });

  const { extractedDataContext, specificOrderInfo, customerInfo, ordersInfo, couponsInfo, cashbackInfo, productsInfo } = enrichedCtx;

  const baseSystemPrompt = aiAgent?.system_prompt || aiConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT;
  log.info(`📝 System prompt source: ${aiAgent?.system_prompt ? `AI Agent (${aiAgent.name})` : aiConfig?.system_prompt ? 'Global Config' : 'Default'}`);

  const fullSystemPrompt = `${baseSystemPrompt}

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

  const aiMessages = [
    { role: 'system', content: fullSystemPrompt },
    ...messageHistory.map(m => ({ role: m.sender_type === 'contact' ? 'user' : 'assistant', content: m.content })),
  ];

  const aiConfig2 = await getAIConfig(supabase, tenantId);
  const model = aiAgent?.model || aiConfig2?.defaultModel || 'gpt-4o-mini';
  const temperature = aiAgent?.temperature ?? 0.7;
  const maxTokens = aiAgent?.max_tokens ?? 500;

  log.info(`🧠 Calling AI: model=${model}, temp=${temperature}, agent=${aiAgent?.name || 'global'}`);

  const aiResult = await callAIWithFallback(supabase, tenantId, aiMessages, model, temperature, maxTokens, aiAgent?.id, conversationId, aiAgent?.ai_provider || null);

  if (!aiResult.success) {
    if (aiResult.error === 'no_ai_provider') {
      log.error('❌ No AI provider configured');
      await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, 'Desculpe, nosso atendimento automático está temporariamente indisponível. Em breve um atendente humano irá ajudá-lo.', supabase, conversationId);
      return new Response(JSON.stringify({ success: false, error: 'NO_AI_PROVIDER', message: 'Nenhum provedor de IA configurado.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    log.error('❌ All AI providers failed:', aiResult.error);
    throw new Error(`Todos os provedores de IA falharam: ${aiResult.error}`);
  }

  const botReply = aiResult.data?.choices?.[0]?.message?.content;
  if (!botReply) throw new Error('No response from AI');

  const tokensInput = aiResult.data?.usage?.prompt_tokens || 0;
  const tokensOutput = aiResult.data?.usage?.completion_tokens || 0;
  log.info(`🤖 AI response via ${aiResult.provider} (${tokensInput}+${tokensOutput}):`, botReply.substring(0, 100));

  const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: 1 });
  if (!hasTokens) {
    log.warn('⚠️ Insufficient tokens');
    return new Response(JSON.stringify({ success: false, error: 'INSUFFICIENT_TOKENS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const messageSent = await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, botReply, supabase, conversationId);

  if (messageSent) {
    const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 1, _type: 'ai_message', _description: 'Mensagem de IA enviada', _reference_id: conversationId });
    if (deductError) log.error('❌ deduct_tokens error:', deductError);
    else if (!deducted) log.warn('⚠️ deduct_tokens returned false');
    else log.info('✅ 1 token deducted');
  } else {
    log.error('❌ Failed to send AI response to WhatsApp');
  }

  // Interactive buttons
  if (aiAgent?.interactive_buttons && (aiAgent.interactive_buttons as InteractiveButton[]).length > 0) {
    const buttons = aiAgent.interactive_buttons as InteractiveButton[];
    const { data: hasButtonTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: 1 });
    if (hasButtonTokens) {
      const buttonsSent = await sendWhatsAppButtons(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, aiAgent.name, 'Posso ajudar com mais alguma coisa?', buttons, supabase);
      if (buttonsSent) {
        await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 1, _type: 'ai_message', _description: 'IA: botões interativos', _reference_id: conversationId });
      } else {
        const { data: hasFallbackTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: tenantId, _amount: 1 });
        if (hasFallbackTokens) {
          const fallbackMsg = `Posso ajudar com mais alguma coisa?\n\n${buttons.map((b, i) => `${i + 1}. ${b.display_text}`).join('\n')}`;
          const fallbackSent = await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, fallbackMsg, supabase, conversationId);
          if (fallbackSent) await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 1, _type: 'ai_message', _description: 'IA: fallback botões (texto)', _reference_id: conversationId });
        }
      }
    } else {
      log.warn('⚠️ No tokens for AI buttons');
    }
  }

  const { data: botMessage } = await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: botReply, status: messageSent ? 'sent' : 'failed' }).select().single();
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

  return new Response(JSON.stringify({ success: true, message_id: botMessage?.id, response: botReply, provider: aiResult.provider, model: aiResult.model, usage: { tokens_input: tokensInput, tokens_output: tokensOutput } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
