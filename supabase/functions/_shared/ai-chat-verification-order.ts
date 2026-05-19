import { sendWhatsAppMessage } from "./ai-chat-whatsapp.ts";
import { getTrackingCode, getOrderCpf, type StoreIntegrationInfo } from "./ai-chat-store.ts";
import { replaceMessageVariables, extractOrderNumber } from "./ai-chat-verification-utils.ts";
import { getStoreColumns } from "./select-columns.ts";
import type { VerificationData, OrderItemRow } from "./ai-chat-types.ts";

interface OrderVerificationOpts {
  supabase: any;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  conversationId: string;
  tenantId: string;
  integrationId: string;
  contactPhone: string;
  messageContent: string;
  verificationState: string;
  verificationData: VerificationData | null;
  verificationMessages: Record<string, string>;
  storeInfo: StoreIntegrationInfo;
  orderNotFoundColumnId: string | null;
  cpfMaxAttemptsColumnId: string | null;
  afterVerifiedColumnId: string | null;
  corsHeaders: Record<string, string>;
  log: any;
}

async function sendAndSave(opts: OrderVerificationOpts, content: string): Promise<void> {
  const { supabase, evolutionApiUrl, evolutionApiKey, conversationId, tenantId, integrationId, contactPhone } = opts;
  await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, content, supabase, conversationId);
  await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content, status: 'sent' });
  await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 1, _type: 'ai_message', _description: 'Verificação de pedido', _reference_id: conversationId });
}

async function transferToHumanOnMaxAttempts(opts: OrderVerificationOpts, attempts: number): Promise<Response> {
  const { supabase, conversationId, tenantId, cpfMaxAttemptsColumnId, verificationMessages, corsHeaders, log } = opts;
  let targetColumnId = cpfMaxAttemptsColumnId;
  if (!targetColumnId) {
    const { data: firstCol } = await supabase.from('kanban_columns').select('id').eq('tenant_id', tenantId).order('position', { ascending: true }).limit(1).single();
    targetColumnId = firstCol?.id || null;
  }
  await supabase.from('conversations').update({ verification_state: null, verification_data: null, status: 'pending', ai_enabled: false, current_ai_agent_id: null, kanban_column_id: targetColumnId }).eq('id', conversationId);
  await sendAndSave(opts, verificationMessages.cpf_max_attempts);
  log.info(`[AI-CHAT] Max CPF attempts, transferring to human, column: ${targetColumnId}`);
  return new Response(JSON.stringify({ success: true, action: 'verification_failed_transfer', attempts, movedToColumn: targetColumnId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function buildAndSendVerifiedMessage(opts: OrderVerificationOpts, order: Record<string, unknown>): Promise<void> {
  const { supabase, storeInfo } = opts;
  const createdDate = order?.data_criacao ? new Date(String(order.data_criacao)).toLocaleDateString('pt-BR') : 'Data não informada';
  let itemsList = '';
  if (order?.id) {
    const { data: orderItems } = await supabase.from(storeInfo.tables.orderItems).select(getStoreColumns(storeInfo.tables.orderItems)).eq('order_id', order.id);
    if (orderItems?.length) itemsList = (orderItems as OrderItemRow[]).map((i) => `  • ${i.quantidade}x ${i.produto_nome}`).join('\n');
  }
  const trackingCode = getTrackingCode(order, storeInfo) || 'Ainda não disponível';
  const msg = `✅ *Identidade confirmada!*\n\n📦 *Pedido #${order?.numero}*\n📅 Data: ${createdDate}\n👤 Cliente: ${order?.cliente_nome || 'Não informado'}\n\n📊 *Status:* ${order?.situacao_nome || 'Não informado'}\n💰 *Valor Total:* R$ ${(order?.valor_total as number)?.toFixed(2) || '0,00'}\n💳 *Pagamento:* ${order?.forma_pagamento || 'Não informado'}\n🚚 *Frete:* R$ ${(order?.valor_frete as number)?.toFixed(2) || '0,00'} (${order?.forma_envio || 'Não informado'})\n📍 *Entrega:* ${order?.endereco_entrega_cidade || 'Não informado'}/${order?.endereco_entrega_estado || ''}\n📦 *Rastreio:* ${trackingCode}${itemsList ? `\n\n🛒 *Itens:*\n${itemsList}` : ''}\n\nPosso ajudar com mais alguma coisa? 😊`;
  await sendAndSave(opts, msg);
}

/** Handle all order verification states. Returns Response to exit, null to continue. */
export async function handleOrderVerification(opts: OrderVerificationOpts): Promise<Response | null> {
  const { supabase, conversationId, tenantId, messageContent, verificationState, verificationData, verificationMessages, storeInfo, orderNotFoundColumnId, afterVerifiedColumnId, corsHeaders, log } = opts;

  // ── awaiting_order_number ─────────────────────────────────────────
  if (verificationState === 'awaiting_order_number') {
    log.info('📦 Order Verification: Awaiting order number...');
    const extractedOrderNumber = extractOrderNumber(messageContent);
    if (!extractedOrderNumber) return null; // let AI ask again

    log.info(`📦 Extracted order number: ${extractedOrderNumber}`);
    const { data: foundOrder, error: searchError } = await supabase.from(storeInfo.tables.orders).select(getStoreColumns(storeInfo.tables.orders)).eq('tenant_id', tenantId).eq('integration_id', storeInfo.integrationId).eq('numero', extractedOrderNumber).maybeSingle();
    if (searchError) log.error('❌ Order search error:', searchError);

    if (foundOrder) {
      log.info(`✅ Order found: #${foundOrder.numero}`);
      let orderCpf = getOrderCpf(foundOrder, storeInfo);

      if (!orderCpf && foundOrder.cliente_telefone) {
        const phoneDigits = foundOrder.cliente_telefone.replace(/\D/g, '').slice(-9);
        const { data: customer } = await supabase.from(storeInfo.tables.customers).select(getStoreColumns(storeInfo.tables.customers)).eq('tenant_id', tenantId).ilike(storeInfo.fields.customerPhone, `%${phoneDigits}%`).maybeSingle();
        if (customer) {
          const cpfVal = storeInfo.type === 'bling' ? customer.cpf_cnpj : customer.cpf;
          orderCpf = cpfVal?.replace(/\D/g, '') || '';
        }
      }

      if (orderCpf && orderCpf.length >= 3) {
        const cpfPrefix = orderCpf.substring(0, 3);
        await supabase.from('conversations').update({ verification_state: 'awaiting_cpf_verification', verification_data: { order_id: foundOrder.id, order_number: foundOrder.numero, cpf_prefix: cpfPrefix, order_data: foundOrder, attempts: 0 } }).eq('id', conversationId);
        await sendAndSave(opts, `✅ Encontrei o pedido #${foundOrder.numero}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe os *3 primeiros dígitos do CPF* cadastrado neste pedido.`);
        return new Response(JSON.stringify({ success: true, action: 'order_verification_cpf_request', order_number: foundOrder.numero }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        await supabase.from('conversations').update({ verification_state: 'awaiting_cpf_full', verification_data: { order_id: foundOrder.id, order_number: foundOrder.numero, order_data: foundOrder, attempts: 0 } }).eq('id', conversationId);
        await sendAndSave(opts, `✅ Encontrei o pedido #${foundOrder.numero}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe o *CPF* cadastrado neste pedido.`);
        return new Response(JSON.stringify({ success: true, action: 'order_verification_cpf_full_request', order_number: foundOrder.numero }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Order not found
    const notFoundMsg = replaceMessageVariables(verificationMessages.order_not_found, { order_number: extractedOrderNumber });
    await sendAndSave(opts, notFoundMsg);
    if (orderNotFoundColumnId) {
      await supabase.from('conversations').update({ kanban_column_id: orderNotFoundColumnId, ai_enabled: false, current_ai_agent_id: null, verification_state: null }).eq('id', conversationId);
    }
    return new Response(JSON.stringify({ success: true, action: 'order_not_found', searched_number: extractedOrderNumber, movedToColumn: orderNotFoundColumnId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── awaiting_cpf_verification ─────────────────────────────────────
  if (verificationState === 'awaiting_cpf_verification' && verificationData) {
    log.info('🔐 Order Verification: Awaiting CPF prefix...');
    const digits = messageContent.replace(/\D/g, '');
    if (digits.length < 3) {
      await sendAndSave(opts, `Por favor, informe apenas os *3 primeiros dígitos* do CPF cadastrado no pedido *#${verificationData.order_number}*.\n\n_Exemplo: se o CPF for 123.456.789-00, digite apenas *123*._`);
      return new Response(JSON.stringify({ success: true, action: 'cpf_digits_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const entered = digits.substring(0, 3);
    const attempts = (verificationData.attempts || 0) + 1;
    log.info(`🔐 CPF prefix: entered=${entered}, expected=${verificationData.cpf_prefix}`);

    if (entered === verificationData.cpf_prefix) {
      log.info('✅ CPF verified!');
      const updateData: Record<string, unknown> = { verification_state: 'verified', verification_data: verificationData };
      if (afterVerifiedColumnId) updateData.kanban_column_id = afterVerifiedColumnId;
      await supabase.from('conversations').update(updateData).eq('id', conversationId);
      await buildAndSendVerifiedMessage(opts, verificationData.order_data as Record<string, unknown>);
      return new Response(JSON.stringify({ success: true, action: 'order_verified', order_number: verificationData.order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    log.info(`❌ CPF mismatch: ${entered} != ${verificationData.cpf_prefix}`);
    if (attempts >= 3) return transferToHumanOnMaxAttempts(opts, attempts);
    await supabase.from('conversations').update({ verification_data: { ...verificationData, attempts } }).eq('id', conversationId);
    await sendAndSave(opts, replaceMessageVariables(verificationMessages.cpf_wrong, { attempts, order_number: verificationData.order_number || '' }));
    return new Response(JSON.stringify({ success: true, action: 'cpf_mismatch', attempts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── awaiting_cpf_full ─────────────────────────────────────────────
  if (verificationState === 'awaiting_cpf_full' && verificationData) {
    log.info('🔐 Order Verification: Awaiting full CPF...');
    const digits = messageContent.replace(/\D/g, '');
    if (digits.length < 11) {
      await sendAndSave(opts, `Por favor, informe o *CPF completo* (11 dígitos) cadastrado no pedido *#${verificationData.order_number}*.\n\n_Exemplo: 123.456.789-00 ou apenas os números: 12345678900_`);
      return new Response(JSON.stringify({ success: true, action: 'cpf_full_digits_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const entered = digits.substring(0, 11);
    const attempts = (verificationData.attempts || 0) + 1;
    const orderData = verificationData.order_data as Record<string, unknown>;
    const orderCpf = ((orderData?.cliente_cpf_cnpj || orderData?.cpf) as string || '').replace(/\D/g, '');
    log.info(`🔐 Full CPF: entered=${entered}, order=${orderCpf}`);

    if (entered === orderCpf) {
      log.info('✅ Full CPF verified!');
      const updateData: Record<string, unknown> = { verification_state: 'verified', verification_data: verificationData };
      if (afterVerifiedColumnId) updateData.kanban_column_id = afterVerifiedColumnId;
      await supabase.from('conversations').update(updateData).eq('id', conversationId);
      await buildAndSendVerifiedMessage(opts, orderData);
      return new Response(JSON.stringify({ success: true, action: 'order_verified_cpf_full', order_number: verificationData.order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    log.info(`❌ Full CPF mismatch: ${entered} != ${orderCpf}`);
    if (attempts >= 3) return transferToHumanOnMaxAttempts(opts, attempts);
    await supabase.from('conversations').update({ verification_data: { ...verificationData, attempts } }).eq('id', conversationId);
    await sendAndSave(opts, replaceMessageVariables(verificationMessages.cpf_wrong, { attempts, order_number: verificationData.order_number || '' }));
    return new Response(JSON.stringify({ success: true, action: 'cpf_full_mismatch', attempts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return null;
}
