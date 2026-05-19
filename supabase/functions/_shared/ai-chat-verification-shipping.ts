import { sendWhatsAppMessage } from "./ai-chat-whatsapp.ts";
import { ME_SHIPMENT_COLUMNS } from "./select-columns.ts";
import type { VerificationData, ShipmentRow } from "./ai-chat-types.ts";
import { replaceMessageVariables, extractOrderNumber, buildShippingDetails } from "./ai-chat-verification-utils.ts";

interface ShippingVerificationOpts {
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
  cpfMaxAttemptsColumnId: string | null;
  shippingDetailsTemplate: string;
  trackingLinkBase: string;
  corsHeaders: Record<string, string>;
  log: any;
}

async function transferToHumanOnMaxAttempts(opts: ShippingVerificationOpts, attempts: number): Promise<Response> {
  const { supabase, evolutionApiUrl, evolutionApiKey, conversationId, tenantId, integrationId, contactPhone, verificationMessages, cpfMaxAttemptsColumnId, corsHeaders, log } = opts;
  let targetColumnId = cpfMaxAttemptsColumnId;
  if (!targetColumnId) {
    const { data: firstColumn } = await supabase.from('kanban_columns').select('id').eq('tenant_id', tenantId).order('position', { ascending: true }).limit(1).single();
    targetColumnId = firstColumn?.id || null;
  }
  await supabase.from('conversations').update({ verification_state: null, verification_data: null, status: 'pending', ai_enabled: false, current_ai_agent_id: null, kanban_column_id: targetColumnId }).eq('id', conversationId);
  const maxMsg = verificationMessages.cpf_max_attempts || verificationMessages.max_attempts;
  await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, maxMsg, supabase, conversationId);
  await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: maxMsg, status: 'sent' });
  log.info(`[AI-CHAT] Max shipping attempts reached, transferring to human`);
  return new Response(JSON.stringify({ success: true, action: 'shipping_verification_failed_transfer', attempts, movedToColumn: targetColumnId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sendAndSave(opts: ShippingVerificationOpts, content: string): Promise<void> {
  const { supabase, evolutionApiUrl, evolutionApiKey, conversationId, tenantId, integrationId, contactPhone } = opts;
  await sendWhatsAppMessage(evolutionApiUrl, evolutionApiKey, integrationId, contactPhone, content, supabase, conversationId);
  await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content, status: 'sent' });
  await supabase.rpc('deduct_tokens', { _tenant_id: tenantId, _amount: 1, _type: 'ai_message', _description: 'Verificação de entrega', _reference_id: conversationId });
}

/** Handle all shipping verification states. Returns Response to exit, null to continue. */
export async function handleShippingVerification(opts: ShippingVerificationOpts): Promise<Response | null> {
  const { supabase, conversationId, tenantId, messageContent, verificationState, verificationData, verificationMessages, corsHeaders, log, shippingDetailsTemplate, trackingLinkBase } = opts;

  const shipDetails = (s: ShipmentRow | null) => buildShippingDetails(s, verificationMessages.after_verified, shippingDetailsTemplate, trackingLinkBase);

  // ── awaiting_order_number ─────────────────────────────────────────
  if (verificationState === 'awaiting_order_number' || verificationState === 'awaiting_both') {
    log.info('📦 Shipping Verification: Awaiting order number...');
    const extractedOrderNumber = extractOrderNumber(messageContent);
    let extractedCpfDigits: string | null = null;
    if (verificationState === 'awaiting_both') {
      const cpfDigits = messageContent.replace(/\D/g, '');
      if (cpfDigits.length >= 3) extractedCpfDigits = cpfDigits.substring(0, 3);
    }

    if (extractedOrderNumber) {
      log.info(`📦 Extracted order number: ${extractedOrderNumber}`);
      const { data: foundShipment } = await supabase.from('me_shipments').select(ME_SHIPMENT_COLUMNS).eq('tenant_id', tenantId).eq('external_order_number', extractedOrderNumber).order('created_at', { ascending: false }).maybeSingle();

      if (foundShipment) {
        const shipmentCpf = (foundShipment.receiver_document || '').replace(/\D/g, '');
        const cpfPrefix = shipmentCpf.length >= 11 ? shipmentCpf.substring(0, 3) : '';
        const shipmentPhone = (foundShipment.receiver_phone || '').replace(/\D/g, '');
        const phoneSuffix = shipmentPhone.length >= 4 ? shipmentPhone.slice(-4) : '';
        const verifyType = cpfPrefix.length >= 3 ? 'cpf' : (phoneSuffix.length === 4 ? 'phone' : 'none');
        log.info(`📋 Verification type: ${verifyType}`);

        // Simultaneous mode: both order number and CPF provided at once
        if (verificationState === 'awaiting_both' && extractedCpfDigits && cpfPrefix && extractedCpfDigits === cpfPrefix) {
          log.info('✅ CPF verified in simultaneous mode!');
          await supabase.from('conversations').update({ verification_state: 'verified', verification_data: { shipment_id: foundShipment.id, order_number: foundShipment.external_order_number, shipment_data: foundShipment } }).eq('id', conversationId);
          await sendAndSave(opts, shipDetails(foundShipment));
          return new Response(JSON.stringify({ success: true, action: 'shipping_verified', order_number: foundShipment.external_order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (verifyType === 'cpf') {
          await supabase.from('conversations').update({ verification_state: 'awaiting_shipping_cpf_verification', verification_data: { shipment_id: foundShipment.id, order_number: foundShipment.external_order_number, verification_type: 'cpf', cpf_prefix: cpfPrefix, phone_suffix: phoneSuffix, shipment_data: foundShipment, attempts: 0 } }).eq('id', conversationId);
          await sendAndSave(opts, verificationMessages.ask_cpf || `✅ Encontrei o envio do pedido #${foundShipment.external_order_number}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n🔐 Por favor, informe os *3 primeiros dígitos do CPF* cadastrado na entrega.`);
          return new Response(JSON.stringify({ success: true, action: 'shipping_verification_cpf_request', order_number: foundShipment.external_order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (verifyType === 'phone') {
          await supabase.from('conversations').update({ verification_state: 'awaiting_shipping_phone_verification', verification_data: { shipment_id: foundShipment.id, order_number: foundShipment.external_order_number, verification_type: 'phone', phone_suffix: phoneSuffix, shipment_data: foundShipment, attempts: 0 } }).eq('id', conversationId);
          await sendAndSave(opts, verificationMessages.ask_phone || `✅ Encontrei o envio do pedido #${foundShipment.external_order_number}!\n\nPara sua segurança, preciso confirmar sua identidade.\n\n📱 Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega.`);
          return new Response(JSON.stringify({ success: true, action: 'shipping_verification_phone_request', order_number: foundShipment.external_order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // No verification data — auto-approve
        log.info('⚠️ No CPF or phone in shipment - auto-approving');
        await supabase.from('conversations').update({ verification_state: 'verified', verification_data: { shipment_id: foundShipment.id, order_number: foundShipment.external_order_number, shipment_data: foundShipment } }).eq('id', conversationId);
        await sendAndSave(opts, shipDetails(foundShipment));
        return new Response(JSON.stringify({ success: true, action: 'shipping_auto_verified', order_number: foundShipment.external_order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Shipment not found
      const notFoundMsg = replaceMessageVariables(verificationMessages.order_not_found, { order_number: extractedOrderNumber });
      await sendAndSave(opts, notFoundMsg);
      return new Response(JSON.stringify({ success: true, action: 'shipment_not_found', searched_order: extractedOrderNumber }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // No order number found
    await sendWhatsAppMessage(opts.evolutionApiUrl, opts.evolutionApiKey, opts.integrationId, opts.contactPhone, verificationMessages.ask_order_number, supabase, conversationId);
    await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: verificationMessages.ask_order_number, status: 'sent' });
    return new Response(JSON.stringify({ success: true, action: 'shipping_order_number_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── awaiting_shipping_cpf_verification ───────────────────────────
  if (verificationState === 'awaiting_shipping_cpf_verification' && verificationData) {
    log.info('🔐 Shipping Verification: Awaiting CPF...');
    const digits = messageContent.replace(/\D/g, '');
    if (digits.length >= 3) {
      const entered = digits.substring(0, 3);
      const attempts = (verificationData.attempts || 0) + 1;
      log.info(`🔐 CPF: entered=${entered}, expected=${verificationData.cpf_prefix}`);
      if (entered === verificationData.cpf_prefix) {
        log.info('✅ Shipping CPF verified!');
        await supabase.from('conversations').update({ verification_state: 'verified', verification_data: verificationData }).eq('id', conversationId);
        await sendAndSave(opts, shipDetails(verificationData.shipment_data as ShipmentRow | null));
        return new Response(JSON.stringify({ success: true, action: 'shipping_verified', order_number: verificationData.order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      log.info(`❌ CPF mismatch: ${entered} != ${verificationData.cpf_prefix}`);
      if (attempts >= 3) return transferToHumanOnMaxAttempts(opts, attempts);
      await supabase.from('conversations').update({ verification_data: { ...verificationData, attempts } }).eq('id', conversationId);
      await sendAndSave(opts, replaceMessageVariables(verificationMessages.cpf_wrong, { attempts, order_number: verificationData.order_number || '' }));
      return new Response(JSON.stringify({ success: true, action: 'shipping_cpf_mismatch', attempts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const ask = `Por favor, informe os *3 primeiros dígitos do CPF* cadastrado na entrega do pedido *#${verificationData.order_number}*.\n\n_Exemplo: se o CPF for 123.456.789-00, digite apenas *123*._`;
    await sendWhatsAppMessage(opts.evolutionApiUrl, opts.evolutionApiKey, opts.integrationId, opts.contactPhone, ask, supabase, conversationId);
    await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: ask, status: 'sent' });
    return new Response(JSON.stringify({ success: true, action: 'shipping_cpf_digits_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── awaiting_shipping_phone_verification ─────────────────────────
  if (verificationState === 'awaiting_shipping_phone_verification' && verificationData) {
    log.info('📱 Shipping Verification: Awaiting phone...');
    const digits = messageContent.replace(/\D/g, '');
    if (digits.length >= 4) {
      const entered = digits.slice(-4);
      const attempts = (verificationData.attempts || 0) + 1;
      log.info(`📱 Phone: entered=${entered}, expected=${verificationData.phone_suffix}`);
      if (entered === verificationData.phone_suffix) {
        log.info('✅ Shipping phone verified!');
        await supabase.from('conversations').update({ verification_state: 'verified', verification_data: verificationData }).eq('id', conversationId);
        await sendAndSave(opts, shipDetails(verificationData.shipment_data as ShipmentRow | null));
        return new Response(JSON.stringify({ success: true, action: 'shipping_verified_by_phone', order_number: verificationData.order_number }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      log.info(`❌ Phone mismatch: ${entered} != ${verificationData.phone_suffix}`);
      if (attempts >= 3) return transferToHumanOnMaxAttempts(opts, attempts);
      await supabase.from('conversations').update({ verification_data: { ...verificationData, attempts } }).eq('id', conversationId);
      await sendAndSave(opts, replaceMessageVariables(verificationMessages.phone_wrong, { attempts: String(attempts) }));
      return new Response(JSON.stringify({ success: true, action: 'shipping_phone_mismatch', attempts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const ask = `Por favor, informe os *4 últimos dígitos do telefone* cadastrado na entrega do pedido *#${verificationData.order_number}*.\n\n_Exemplo: se o telefone for (11) 98765-4321, digite apenas *4321*._`;
    await sendWhatsAppMessage(opts.evolutionApiUrl, opts.evolutionApiKey, opts.integrationId, opts.contactPhone, ask, supabase, conversationId);
    await supabase.from('messages').insert({ conversation_id: conversationId, tenant_id: tenantId, sender_type: 'bot', content: ask, status: 'sent' });
    return new Response(JSON.stringify({ success: true, action: 'shipping_phone_digits_not_found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return null;
}
