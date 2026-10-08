import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface SendMessagePayload {
  conversation_id: string;
  content: string;
  sender_id?: string;
  sender_name?: string;
  direction?: string;
  /** Id gerado pelo painel a cada clique em enviar: o mesmo id nao cria segunda mensagem. */
  client_message_id?: string;
}

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("send-message", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authenticate the caller via shared auth guard
    const { userId, tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: SendMessagePayload = await req.json();
    const { conversation_id, content, sender_id, sender_name, direction = 'outbound', client_message_id } = payload;

    log.info('📤 Send message request:', { conversation_id, content: content.substring(0, 50) + '...' });

    if (!conversation_id || !content) {
      return new Response(JSON.stringify({ error: 'conversation_id and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single authoritative check: conversation belongs to tenant + fetch related data
    const conversation = await requireResource<{
      id: string;
      tenant_id: string;
      contact_id: string;
      integration_id: string;
      channel: string;
      channel_id: string | null;
      status: string;
      assigned_to: string | null;
      last_incoming_message_id: string | null;
      contact: { id: string; phone: string; name: string; metadata: Record<string, unknown> } | null;
      integration: { id: string; metadata: Record<string, unknown>; status: string } | null;
    }>(
      supabase,
      'conversations',
      conversation_id,
      authTenantId,
      req,
      '*, contact:contacts(id, phone, name, metadata), integration:integrations(id, metadata, status)'
    );

    // Idempotencia: mesmo clique reenviado (duplo clique, retry de rede) devolve a mensagem que ja existe.
    const clientId = typeof client_message_id === 'string' && client_message_id.length <= 80 ? client_message_id : null;
    const findDuplicate = async () => {
      if (!clientId) return null;
      const { data } = await supabase.from('messages').select('id').eq('conversation_id', conversation_id)
        .eq('metadata->>client_message_id', clientId).maybeSingle();
      return data?.id ?? null;
    };
    const already = await findDuplicate();
    if (already) {
      return new Response(JSON.stringify({ success: true, message_id: already, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Token check
    const { data: hasTokens } = await supabase.rpc('has_enough_tokens', {
      _tenant_id: conversation.tenant_id,
      _amount: 1,
    });

    if (!hasTokens) {
      return new Response(JSON.stringify({
        error: 'Tokens insuficientes para enviar mensagem',
        code: 'INSUFFICIENT_TOKENS',
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contact = conversation.contact;
    if (!contact?.phone) {
      return new Response(JSON.stringify({ error: 'Contact phone not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Internal notes don't go through the queue
    if (direction === 'internal_note') {
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          tenant_id: conversation.tenant_id,
          sender_type: 'agent',
          sender_id: sender_id || null,
          content,
          content_type: 'text',
          status: 'sent',
          direction: 'internal_note',
          type: 'text',
          metadata: { agent_name: sender_name || 'Atendente', ...(clientId ? { client_message_id: clientId } : {}) },
        })
        .select()
        .single();

      if (msgError?.code === '23505') {
        return new Response(JSON.stringify({ success: true, message_id: await findDuplicate(), duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (msgError) throw msgError;

      return new Response(JSON.stringify({ success: true, message_id: message.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve channel_id: deve vir da conversa — sem fallback "primeiro disponível"
    const channelId = conversation.channel_id;

    if (!channelId) {
      return new Response(
        JSON.stringify({
          error: 'Conversa sem canal WhatsApp associado. Reconecte a integração ou archive esta conversa e inicie uma nova.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create message with status 'queued'
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        tenant_id: conversation.tenant_id,
        sender_type: 'agent',
        sender_id: sender_id || null,
        content,
        content_type: 'text',
        status: 'queued',
        direction: 'outbound',
        type: 'text',
        metadata: { agent_name: sender_name || 'Atendente', ...(clientId ? { client_message_id: clientId } : {}) },
      })
      .select()
      .single();

    if (msgError?.code === '23505') {
      return new Response(JSON.stringify({ success: true, message_id: await findDuplicate(), duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (msgError) throw msgError;

    // Resolver número real: se o contato ainda tem @lid no phone,
    // tentar pegar o número real do metadata (coletado pela recepcionista virtual)
    const rawContactPhone = contact.phone as string;
    const isLidContact = rawContactPhone.includes('@lid');
    const contactMeta = (contact.metadata || {}) as Record<string, string>;
    const realPhoneFromMeta = contactMeta.real_phone || contactMeta.lid_phone || null;
    
    // Usar número real se disponível, senão usar o phone do contato (que pode ser LID)
    const phoneToUse = isLidContact && realPhoneFromMeta ? realPhoneFromMeta : rawContactPhone;
    const shouldUseReply = isLidContact && !realPhoneFromMeta; // só usar reply LID se não há número real

    log.info(`📱 Sending to: ${phoneToUse} (isLid: ${isLidContact}, hasRealPhone: ${!!realPhoneFromMeta})`);

    const { error: queueError } = await supabase
      .from('outbound_queue')
      .insert({
        tenant_id: conversation.tenant_id,
        message_id: message.id,
        channel_id: channelId,
        to_phone_e164: phoneToUse,
        payload_json: {
          text: content,
          quoted_message_id: shouldUseReply ? conversation.last_incoming_message_id : null,
          metadata: { agent_name: sender_name || 'Atendente' },
        },
        status: 'pending',
        next_retry_at: new Date().toISOString(),
      });

    if (queueError) {
      log.error('❌ Error creating queue entry:', queueError);
      // Update message to failed
      await supabase.from('messages').update({ status: 'failed', error_json: { error: queueError.message } }).eq('id', message.id);
      throw queueError;
    }

    // Deduct token
    await supabase.rpc('deduct_tokens', {
      _tenant_id: conversation.tenant_id,
      _amount: 1,
      _type: 'agent_message',
      _description: 'Mensagem enviada pelo atendente',
      _reference_id: message.id,
    });

    // Update conversation timestamps
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_outbound_at: new Date().toISOString(),
        status: conversation.status === 'bot' ? 'open' : conversation.status,
        assigned_to: conversation.assigned_to || sender_id || null,
      })
      .eq('id', conversation_id);

    // Trigger immediate processing of outbound queue (fire-and-forget)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-outbound-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trigger: 'send-message' }),
    }).catch((e) => {
      log.warn('⚠️ Could not trigger immediate outbound processing:', e);
    });

    log.info(`✅ Message ${message.id} queued for sending`);

    return new Response(JSON.stringify({
      success: true,
      message_id: message.id,
      queued: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    // Auth guard throws Response objects — pass them through
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message
      : (typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : 'Unknown error');
    log.error('❌ Send message error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

