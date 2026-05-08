import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { 
  sendTextWithTokenCharge, 
  sendReplyWithTokenCharge,
  WhatsAppConfig 
} from "../_shared/whatsapp-sender.ts";
import {
  type EvolutionMessage,
  parseMessageContent,
  replaceMessagePlaceholders,
} from "../_shared/wa-webhook-message-parser.ts";
import { syncWithChatwoot } from "../_shared/wa-webhook-chatwoot-sync.ts";
import { sendReceptionistMenu, type MenuOption } from "../_shared/wa-webhook-receptionist-menu.ts";
import {
  CONTACT_COLUMNS, CONVERSATION_COLUMNS, RECEPTIONIST_CONFIG_COLUMNS,
} from "../_shared/select-columns.ts";

// Type declaration for EdgeRuntime (Supabase Edge Functions background tasks)
declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void } | undefined;

/** Extended Evolution payload fields for status updates */
interface EvolutionStatusUpdate {
  key: { id: string; remoteJid?: string; fromMe?: boolean };
  status: string;
  participant?: string;
}

/** Extended Evolution payload with optional extra fields */
interface EvolutionPayloadExt extends EvolutionMessage {
  participant?: string;
  data: EvolutionMessage['data'] & {
    participant?: string;
    key: EvolutionMessage['data']['key'] & {
      remoteJidAlt?: string;
    };
  };
}

/** Integration metadata shape */
interface IntegrationMetadata {
  instanceName?: string;
  phoneNumber?: string;
  apiKey?: string;
  chatwootAccountId?: number;
  chatwootInboxId?: number;
  chatwootInboxIdentifier?: string;
  [key: string]: unknown;
}

/** Inbox agent data shape */
interface InboxAgentData {
  welcome_message?: string | null;
  interactive_buttons?: InteractiveButton[] | null;
}

import type { InteractiveButton } from "../_shared/ai-chat-whatsapp.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("whatsapp-webhook", cid);
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const chatwootPlatformUrl = Deno.env.get('CHATWOOT_PLATFORM_URL');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: EvolutionMessage = await req.json();
    
    log.info('📩 Webhook received:', JSON.stringify(payload, null, 2));

    // Handle message status updates (delivered, read)
    if (payload.event === 'messages.update' && (payload.data as unknown as EvolutionStatusUpdate)?.status) {
      const { key, status } = payload.data as unknown as EvolutionStatusUpdate;
      if (key?.id) {
        log.info(`📊 Updating message status: ${key.id} -> ${status}`);
        const { error: statusError } = await supabase
          .from('messages')
          .update({ 
            status: await supabase.rpc('map_evolution_status', { status }).then(r => r.data || status.toLowerCase()),
            updated_at: new Date().toISOString()
          })
          .eq('metadata->>whatsapp_message_id', key.id);
        
        if (statusError) {
          log.error('⚠️ Error updating message status:', statusError);
        }
      }
      return new Response(JSON.stringify({ success: true, type: 'status_update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process incoming messages (not sent by us)
    if (payload.event !== 'messages.upsert' || payload.data?.key?.fromMe) {
      log.info('⏭️ Skipping: not an incoming message');
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceName = payload.instance;
    const remoteJid = payload.data.key.remoteJid;
    
    // NOVO: Buscar integração PRIMEIRO para obter o número da instância
    // Isso é necessário para filtrar o próprio número ao processar LID contacts
    const { data: integrationEarly, error: integrationEarlyError } = await supabase
      .from('integrations')
      .select('id, tenant_id, metadata')
      .in('type', ['evolution_api', 'evolution_whatsapp'])
      .eq('status', 'connected')
      .filter('metadata->>instanceName', 'eq', instanceName)
      .single();

    // Obter número da instância para filtrar (evitar usar nosso próprio número)
    const instancePhoneNumber = integrationEarly?.metadata 
      ? (integrationEarly.metadata as IntegrationMetadata)?.phoneNumber || ''
      : '';
    
    log.info('📞 Instance phone number for filtering:', instancePhoneNumber || 'NOT_SET');
    
    // Handle LID contacts (Meta Ads / Click-to-WhatsApp)
    // CORREÇÃO: Priorizar número real no campo phone, salvar LID no metadata
    let phone: string = '';
    let isLidContact = false;
    let realPhoneFromAlt: string | null = null;
    let lidIdentifier: string | null = null;
    
    if (remoteJid.endsWith('@lid')) {
      isLidContact = true;
      lidIdentifier = remoteJid; // Guardar LID para referência
      
      // DEBUG: Log completo para análise de onde vem o número real
      log.info('🔍 LID DEBUG - Complete payload analysis:');
      log.info('🔍 LID DEBUG - payload.sender:', payload.sender);
      log.info('🔍 LID DEBUG - payload.data.key:', JSON.stringify(payload.data.key));
      const extPayload = payload as EvolutionPayloadExt;
      log.info('🔍 LID DEBUG - payload.data.participant:', extPayload.data?.participant);
      log.info('🔍 LID DEBUG - payload.participant:', extPayload?.participant);
      
      // Tentar múltiplas fontes do número real (ordem de prioridade)
      const possiblePhoneSources: (string | undefined)[] = [
        payload.sender,                                    // Campo principal (Ex: 5511999999999@s.whatsapp.net)
        extPayload.data.key?.remoteJidAlt,                // Fallback 1
        extPayload.data?.participant,                     // Fallback 2 (grupos)
        extPayload?.participant,                          // Fallback 3
      ];
      
      log.info('🔍 LID DEBUG - All possible sources:', possiblePhoneSources);
      
      // CORREÇÃO: Resolver número da instância via múltiplas fontes
      // 1) metadata da integração, 2) tabela whatsapp_channels, 3) Evolution API em tempo real
      let instancePhoneResolved = instancePhoneNumber;
      
      if (!instancePhoneResolved) {
        const { data: channelData } = await supabase
          .from('whatsapp_channels')
          .select('id, phone_e164')
          .eq('provider_account_id', instanceName)
          .maybeSingle();
        instancePhoneResolved = channelData?.phone_e164?.replace('+', '') || '';
        if (instancePhoneResolved) {
          log.info('📞 Instance phone resolved from whatsapp_channels:', instancePhoneResolved);
        }
      }

      // Se ainda não resolveu, buscar da Evolution API
      if (!instancePhoneResolved) {
        try {
          const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || '';
          const evolutionApiKey = (integrationEarly?.metadata as IntegrationMetadata)?.apiKey || Deno.env.get('EVOLUTION_API_KEY') || '';
          if (evolutionUrl && evolutionApiKey) {
            const evResp = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
              headers: { 'apikey': evolutionApiKey },
            });
            if (evResp.ok) {
              const evData = await evResp.json();
              // A API pode retornar array ou objeto
              const instanceData = Array.isArray(evData) ? evData[0] : evData;
              const ownerJid = instanceData?.instance?.ownerJid || instanceData?.ownerJid || '';
              if (ownerJid && ownerJid.includes('@s.whatsapp.net')) {
                instancePhoneResolved = ownerJid.replace('@s.whatsapp.net', '').replace('+', '');
                log.info('📞 Instance phone resolved from Evolution API:', instancePhoneResolved);
                // Salvar no banco para evitar essa consulta futuramente
                const phoneFormatted = '+' + instancePhoneResolved;
                await supabase
                  .from('whatsapp_channels')
                  .update({ phone_e164: phoneFormatted })
                  .eq('provider_account_id', instanceName);
                await supabase
                  .from('integrations')
                  .update({ metadata: { ...(integrationEarly?.metadata as IntegrationMetadata || {}), phoneNumber: instancePhoneResolved } })
                  .eq('id', integrationEarly?.id);
                log.info('💾 Instance phone saved to DB:', phoneFormatted);
              }
            }
          }
        } catch (evErr) {
          log.error('⚠️ Could not fetch instance phone from Evolution API:', evErr);
        }
      }

      // Também verificar se o próprio payload.sender é o número da instância
      // através do campo 'sender' no nível raiz (que a Evolution sempre preenche com o número da instância)
      // REGRA: em mensagens LID, o `payload.sender` É sempre o número da instância
      // portanto NÃO usar payload.sender como número do cliente — usar apenas como confirmação do instancePhone
      if (!instancePhoneResolved && payload.sender?.includes('@s.whatsapp.net')) {
        // Se não conseguimos resolver de nenhuma fonte, o sender pode ser o número da instância
        // Neste caso, marcamos como tal para filtrar
        instancePhoneResolved = payload.sender.replace('@s.whatsapp.net', '');
        log.info('📞 Instance phone inferred from payload.sender:', instancePhoneResolved);
        // Salvar no banco
        const phoneFormatted = '+' + instancePhoneResolved;
        await supabase
          .from('whatsapp_channels')
          .update({ phone_e164: phoneFormatted })
          .eq('provider_account_id', instanceName);
        if (integrationEarly?.id) {
          await supabase
            .from('integrations')
            .update({ metadata: { ...(integrationEarly?.metadata as IntegrationMetadata || {}), phoneNumber: instancePhoneResolved } })
            .eq('id', integrationEarly?.id);
        }
        log.info('💾 Instance phone (from sender) saved to DB:', phoneFormatted);
      }

      // Agora filtrar as fontes — EXCLUIR o número da instância
      // ATENÇÃO: em mensagens LID, payload.sender É o número da instância, não do cliente!
      // O número do cliente deve vir de outra fonte (participant, remoteJidAlt, etc.)
      // Se todas as fontes forem o número da instância, não temos o número real
      for (const source of possiblePhoneSources) {
        if (source && source.includes('@s.whatsapp.net')) {
          const extractedNumber = source.replace('@s.whatsapp.net', '');
          
          // Sempre filtrar o número da própria instância
          if (instancePhoneResolved && extractedNumber === instancePhoneResolved) {
            log.info('⚠️ LID SKIP: sender é o número da própria instância:', extractedNumber);
            continue;
          }
          
          realPhoneFromAlt = extractedNumber;
          phone = realPhoneFromAlt;
          log.info('✅ LID contact - número REAL encontrado:', phone, 'fonte:', source);
          break;
        }
      }
      
      // Se não encontrou número real válido, usar LID temporariamente
      if (!realPhoneFromAlt) {
        phone = remoteJid;
        log.info('⚠️ LID contact SEM número real - nenhuma fonte válida encontrada (ou todas eram o número da instância)');
        log.info('⚠️ LID contact - usando LID temporariamente:', phone);
        log.info('⚠️ LID contact - será necessário capturar via Recepcionista Virtual');
      }
    } else {
      // Normal WhatsApp contact - extract phone number
      phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    }
    
    const contactName = payload.data.pushName || (isLidContact ? `Lead ${phone.replace('@lid', '').slice(-4)}` : phone);
    
    // Extract message content and button click info
    // Extract message content using shared parser
    const parsed = parseMessageContent(payload);
    const messageContent = parsed.text;
    const contentType = parsed.contentType;
    const mediaUrl = parsed.mediaUrl;
    const buttonClickId = parsed.buttonClickId;

    if (buttonClickId) {
      log.info(`🔘 Button/list clicked: ${buttonClickId} - "${messageContent}"`);
    }

    if (!messageContent) {
      log.info('⏭️ Skipping: no message content');
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`📱 Message from ${phone}: ${messageContent}`);

    // Use integration already fetched earlier for LID phone filtering
    const integration = integrationEarly;
    const integrationError = integrationEarlyError;

    if (integrationError || !integration) {
      log.error('❌ Integration not found for instance:', instanceName);
      return new Response(JSON.stringify({ error: 'Integration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = integration.tenant_id;
    const integrationMeta = integration.metadata as IntegrationMetadata;

    log.info(`🏢 Tenant ID: ${tenantId}`);

    // Build WhatsApp config for tokenized sending
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const whatsAppConfig: WhatsAppConfig = {
      evolutionApiUrl,
      evolutionApiKey,
      instanceName: (integration.metadata as IntegrationMetadata)?.instanceName || instanceName,
    };

    // Find or create contact
    // Buscar por phone real primeiro, depois por LID se necessário
    let { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .single();

    // Se é LID e não encontrou pelo phone (que pode ter sido atualizado para número real):
    // buscar pelo lid_identifier nos metadados
    if (!contact && isLidContact && lidIdentifier) {
      const { data: lidContactByMeta } = await supabase
        .from('contacts')
        .select(CONTACT_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('metadata->>lid_identifier', lidIdentifier)
        .maybeSingle();

      if (lidContactByMeta) {
        log.info('📱 Contato encontrado via lid_identifier no metadata:', lidContactByMeta.id, 'phone atual:', lidContactByMeta.phone);
        contact = lidContactByMeta;
        contactError = null;
      }
    }

    // Se é LID com número real e não encontrou, buscar pelo LID original no campo phone
    if (!contact && isLidContact && realPhoneFromAlt && lidIdentifier) {
      const { data: lidContact } = await supabase
        .from('contacts')
        .select(CONTACT_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('phone', lidIdentifier)
        .single();
      
      if (lidContact) {
        // Atualizar contato LID existente com número real no campo phone
        log.info('📱 Atualizando contato LID existente com número real:', realPhoneFromAlt);
        const existingMetadata = (lidContact.metadata || {}) as Record<string, unknown>;
        
        await supabase
          .from('contacts')
          .update({ 
            phone: realPhoneFromAlt,
            metadata: {
              ...existingMetadata,
              lid_identifier: lidIdentifier,
              phone_updated_at: new Date().toISOString(),
              phone_source: 'remoteJidAlt',
            }
          })
          .eq('id', lidContact.id);
        
        contact = { ...lidContact, phone: realPhoneFromAlt };
        contactError = null;
      }
    }

    if (contactError && contactError.code === 'PGRST116') {
      // Contact doesn't exist, create it
      const contactMetadata: Record<string, unknown> = {};
      
      // Se for LID, salvar identificador no metadata (não no phone)
      if (isLidContact && lidIdentifier) {
        contactMetadata.lid_identifier = lidIdentifier;
        contactMetadata.created_from_lid = true;
        contactMetadata.has_real_phone = !!realPhoneFromAlt;
        if (!realPhoneFromAlt) {
          contactMetadata.needs_phone_capture = true;
        }
      }

      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenantId,
          phone, // Já contém o número real se disponível
          name: contactName,
          metadata: contactMetadata,
        })
        .select()
        .single();

      if (createError) {
        log.error('❌ Error creating contact:', createError);
        throw createError;
      }
      contact = newContact;
      log.info('👤 New contact created:', contact.id, `phone: ${phone}`, isLidContact ? `(LID: ${lidIdentifier})` : '');
    } else if (contactError) {
      throw contactError;
    } else {
      // Update contact name if changed
      if (contact.name !== contactName && contactName !== phone) {
        await supabase
          .from('contacts')
          .update({ name: contactName })
          .eq('id', contact.id);
      }
      
      // CORREÇÃO: Se contato existente tem @lid no phone mas agora temos o número real
      if (contact.phone.includes('@lid') && realPhoneFromAlt) {
        log.info('📱 Atualizando phone do contato LID para número real:', realPhoneFromAlt);
        const existingMetadata = (contact.metadata || {}) as Record<string, unknown>;
        
        await supabase
          .from('contacts')
          .update({ 
            phone: realPhoneFromAlt, // MOVER número real para campo principal
            metadata: {
              ...existingMetadata,
              lid_identifier: contact.phone, // Salvar LID original
              phone_updated_at: new Date().toISOString(),
              phone_source: 'remoteJidAlt',
            }
          })
          .eq('id', contact.id);
        
        contact.phone = realPhoneFromAlt;
      }
    }

    // Find or create conversation
    let { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .is('closed_at', null)
      .in('status', ['bot', 'open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let isNewConversation = false;
    
    if (conversationError && conversationError.code === 'PGRST116') {
      isNewConversation = true;
      // No active conversation, create new one
      // Get default kanban column for new conversations
      const { data: defaultColumn } = await supabase
        .from('kanban_columns')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_default_for_new', true)
        .maybeSingle();

      // If no default, try to get first column
      let kanbanColumnId = defaultColumn?.id || null;
      if (!kanbanColumnId) {
        const { data: firstColumn } = await supabase
          .from('kanban_columns')
          .select('id')
          .eq('tenant_id', tenantId)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        kanbanColumnId = firstColumn?.id || null;
      }

      // Get default AI agent from ai_assistant_configs
      let defaultAiAgentId: string | null = null;
      let startOrderVerificationFlow = false;
      
      const { data: aiAssistantConfig } = await supabase
        .from('ai_assistant_configs')
        .select('default_ai_agent_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (aiAssistantConfig?.default_ai_agent_id) {
        defaultAiAgentId = aiAssistantConfig.default_ai_agent_id;
        log.info('🤖 Using default AI agent:', defaultAiAgentId);
        
        // Check if the default agent has order verification enabled
        const { data: defaultAgent } = await supabase
          .from('ai_agents')
          .select('data_access')
          .eq('id', defaultAiAgentId)
          .single();
        
        if (defaultAgent?.data_access) {
          const dataAccess = defaultAgent.data_access as { orders?: boolean; smart_search?: boolean };
          if (dataAccess.orders && dataAccess.smart_search) {
            startOrderVerificationFlow = true;
            log.info('🔐 Default agent has order verification - will start verification flow');
          }
        }
      }

      // Resolve channel_id and inbox_id for the new conversation
      let resolvedChannelId: string | null = null;
      let resolvedInboxId: string | null = null;

      const { data: whatsappChannel } = await supabase
        .from('whatsapp_channels')
        .select('id')
        .eq('integration_id', integration.id)
        .limit(1)
        .maybeSingle();

      if (whatsappChannel) {
        resolvedChannelId = whatsappChannel.id;
        const { data: linkedInbox } = await supabase
          .from('inboxes')
          .select('id')
          .eq('channel_id', whatsappChannel.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        resolvedInboxId = linkedInbox?.id || null;
      }

      log.info(`🔗 Resolved channel_id=${resolvedChannelId}, inbox_id=${resolvedInboxId}`);

      // Se não há inbox configurado para este canal, ignorar a mensagem.
      // O usuário precisa criar um Canal e uma Inbox em Atendimentos antes de receber mensagens.
      if (!resolvedInboxId) {
        log.info(`⏭️ Skipping: Integration "${instanceName}" has no inbox configured. Create an Inbox in Atendimentos > Inboxes first.`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_inbox_configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          contact_id: contact.id,
          integration_id: integration.id,
          channel_id: resolvedChannelId,
          inbox_id: resolvedInboxId,
          status: 'bot',
          ai_enabled: true,
          bot_state_json: { stage: 'welcome', context: {} },
          kanban_column_id: kanbanColumnId,
          current_ai_agent_id: defaultAiAgentId,
          verification_state: startOrderVerificationFlow ? 'awaiting_order_number' : null,
        })
        .select()
        .single();

      if (createError) {
        log.error('❌ Error creating conversation:', createError);
        throw createError;
      }
      conversation = newConversation;
      log.info('💬 New conversation created:', conversation.id, startOrderVerificationFlow ? '(with order verification)' : '');
    } else if (conversationError) {
      throw conversationError;
    }

    // Verificar se conversa existente tem inbox_id configurado
    // (pode ter sido criada antes de configurar a inbox)
    if (!conversation.inbox_id) {
      // Tentar resolver e atualizar a conversa existente
      const { data: whatsappChannelEx } = await supabase
        .from('whatsapp_channels')
        .select('id')
        .eq('integration_id', integration.id)
        .limit(1)
        .maybeSingle();

      if (whatsappChannelEx) {
        const { data: linkedInboxEx } = await supabase
          .from('inboxes')
          .select('id')
          .eq('channel_id', whatsappChannelEx.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (linkedInboxEx) {
          // Inbox agora configurada - vincular a conversa e continuar
          await supabase
            .from('conversations')
            .update({ channel_id: whatsappChannelEx.id, inbox_id: linkedInboxEx.id })
            .eq('id', conversation.id);
          conversation.inbox_id = linkedInboxEx.id;
          conversation.channel_id = whatsappChannelEx.id;
          log.info(`✅ Conversation ${conversation.id} updated with inbox ${linkedInboxEx.id}`);
        } else {
          // Ainda sem inbox - ignorar mensagem
          log.info(`⏭️ Skipping: Existing conversation has no inbox configured for instance "${instanceName}".`);
          return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_inbox_configured' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Sem canal configurado - ignorar mensagem
        log.info(`⏭️ Skipping: No whatsapp channel found for instance "${instanceName}".`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_channel_configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── ATOMIC DEDUP: INSERT-first pattern ──────────────────────────
    // Instead of SELECT-then-INSERT (race-condition prone), we INSERT directly
    // and rely on the unique partial index on provider_message_id to reject duplicates.
    // This ensures that even if two webhook deliveries arrive simultaneously,
    // only ONE will succeed the insert and proceed to process the message.
    const whatsappMessageId = payload.data.key.id;

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        tenant_id: tenantId,
        sender_type: 'contact',
        sender_id: contact.id,
        content: messageContent,
        content_type: contentType,
        media_url: mediaUrl || null,
        provider_message_id: whatsappMessageId || null,
        metadata: {
          whatsapp_message_id: whatsappMessageId,
          timestamp: payload.data.messageTimestamp,
        },
      })
      .select()
      .single();

    if (messageError) {
      // Duplicate key on provider_message_id → another request already processing this message
      if (messageError.code === '23505') {
        log.info('⏭️ Dedup (atomic): message already being processed, skipping:', whatsappMessageId);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'duplicate_message' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      log.error('❌ Error saving message:', messageError);
      throw messageError;
    }

    log.info('💾 Message saved:', message.id);

    // Update conversation last_message_at and last_incoming_message_id (for LID reply support)
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        last_incoming_message_id: payload.data.key.id, // Salvar ID para reply em contatos LID
      })
      .eq('id', conversation.id);

    // Check if we are awaiting phone input from a LID contact
    if (conversation.awaiting_phone_input && isLidContact) {
      log.info('📱 Processing phone number response for LID contact...');
      
      // Try to extract a valid phone number from the message
      const phoneMatch = messageContent.replace(/\D/g, '');
      
      // Validate: Brazilian phone should be 10-11 digits (with DDD)
      if (phoneMatch.length >= 10 && phoneMatch.length <= 13) {
        let realPhone = phoneMatch;
        
        // Normalize to 55XXXXXXXXXXX format
        if (!realPhone.startsWith('55')) {
          realPhone = '55' + realPhone;
        }
        
        log.info('✅ Valid phone number received:', realPhone);
        
        // ── Verificar se já existe contato com esse número real ──────────────
        // Se existir, mesclar: migrar a conversa para o contato existente e deletar o LID
        const { data: existingContactWithPhone } = await supabase
          .from('contacts')
          .select('id, name, metadata')
          .eq('tenant_id', tenantId)
          .eq('phone', realPhone)
          .maybeSingle();

        let finalContactId = contact.id;

        if (existingContactWithPhone && existingContactWithPhone.id !== contact.id) {
          log.info('🔀 Contact merge: real phone already exists as contact', existingContactWithPhone.id);
          
          // Migrar a conversa para o contato com número real
          await supabase
            .from('conversations')
            .update({ contact_id: existingContactWithPhone.id })
            .eq('id', conversation.id);
          
          // Atualizar nome do contato real se o LID tinha nome melhor
          if (contact.name && !existingContactWithPhone.name) {
            await supabase
              .from('contacts')
              .update({ name: contact.name })
              .eq('id', existingContactWithPhone.id);
          }
          
          // Salvar LID no metadata do contato real
          const realMeta = (existingContactWithPhone.metadata || {}) as Record<string, unknown>;
          await supabase
            .from('contacts')
            .update({ metadata: { ...realMeta, lid_identifier: phone, phone_updated_from_lid: true } })
            .eq('id', existingContactWithPhone.id);
          
          // Deletar contato LID (agora sem conversas)
          await supabase.from('contacts').delete().eq('id', contact.id);
          
          finalContactId = existingContactWithPhone.id;
        } else {
          // Sem colisão: atualizar o phone PRINCIPAL do contato atual para o número real
          const existingMetadata = (contact.metadata || {}) as Record<string, unknown>;
          await supabase
            .from('contacts')
            .update({
              phone: realPhone,
              metadata: {
                ...existingMetadata,
                lid_identifier: phone,
                phone_updated_from_lid: true,
                phone_collected_at: new Date().toISOString(),
              }
            })
            .eq('id', contact.id);
          finalContactId = contact.id;
        }
        
        // Mark conversation as no longer awaiting phone input
        await supabase
          .from('conversations')
          .update({ awaiting_phone_input: false })
          .eq('id', conversation.id);
        
        // No confirmation message sent - bot will start directly on the real phone number
        
        // ================================================================
        // NOVO FLUXO: Disparar o bot diretamente para o número real do cliente
        // Usa SEMPRE a instância desta integração (não a global)
        // ================================================================
        log.info('🚀 Dispatching bot to real phone number:', realPhone);
        
        // Instância desta integração específica (ex: "haze", não "useokok")
        const dispatchInstance = (integration.metadata as { instanceName?: string })?.instanceName || instanceName;
        const evUrl = Deno.env.get('EVOLUTION_API_URL')!;
        const evKey = Deno.env.get('EVOLUTION_API_KEY')!;

        // Buscar a saudação do Recepcionista ou do agente de IA desta integração/inbox
        const [{ data: receptionistConfigForLid }, { data: aiAssistantConfigLid }] = await Promise.all([
          supabase
            .from('receptionist_configs')
            .select(RECEPTIONIST_CONFIG_COLUMNS)
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('ai_assistant_configs')
            .select('default_ai_agent_id')
            .eq('tenant_id', tenantId)
            .maybeSingle(),
        ]);
        
        // Buscar o agente vinculado à inbox desta instância (mais específico)
        let inboxAgentData: InboxAgentData | null = null;
        if (conversation.inbox_id) {
          const { data: inboxAgent } = await supabase
            .from('inboxes')
            .select('ai_agent_id')
            .eq('id', conversation.inbox_id)
            .single();
          if (inboxAgent?.ai_agent_id) {
            const { data: agentData } = await supabase
              .from('ai_agents')
              .select('welcome_message, interactive_buttons')
              .eq('id', inboxAgent.ai_agent_id)
              .single();
            inboxAgentData = agentData || null;
          }
        }

        // Build full menu text (welcome_message + numbered options from interactive_buttons)
        const buildFullMenuText = (welcomeMsg: string, buttons: Array<{ text: string }>) => {
          if (!buttons || buttons.length === 0) return welcomeMsg;
          const options = buttons.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n');
          return `${welcomeMsg}\n\n${options}`;
        };

        let welcomeForRealPhone = `Olá! 👋 Como posso ajudar?`;
        
        if (inboxAgentData?.welcome_message) {
          const welcomeMsg = replaceMessagePlaceholders(inboxAgentData.welcome_message, contact.name || 'cliente');
          const buttons = (inboxAgentData.interactive_buttons as Array<{ text: string }>) || [];
          welcomeForRealPhone = buildFullMenuText(welcomeMsg, buttons);
        } else if (receptionistConfigForLid) {
          const menuOptions = receptionistConfigForLid.menu_options as Array<{
            id: string; label: string; action_type: string;
          }>;
          const welcomeMsg = replaceMessagePlaceholders(receptionistConfigForLid.welcome_message, contact.name || 'cliente');
          welcomeForRealPhone = `${welcomeMsg}\n\n${menuOptions.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`;
        } else if (aiAssistantConfigLid?.default_ai_agent_id) {
          const { data: defaultAgent } = await supabase
            .from('ai_agents')
            .select('welcome_message, interactive_buttons')
            .eq('id', aiAssistantConfigLid.default_ai_agent_id)
            .single();
          if (defaultAgent?.welcome_message) {
            const welcomeMsg = replaceMessagePlaceholders(defaultAgent.welcome_message, contact.name || 'cliente');
            const buttons = (defaultAgent.interactive_buttons as Array<{ text: string }>) || [];
            welcomeForRealPhone = buildFullMenuText(welcomeMsg, buttons);
          }
        }
        
        // Enviar mensagem de boas-vindas para o número real via ESTA instância
        try {
          const sendResp = await fetch(`${evUrl}/message/sendText/${dispatchInstance}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evKey,
            },
            body: JSON.stringify({
              number: realPhone,
              text: welcomeForRealPhone,
            }),
          });
          
          if (sendResp.ok) {
            const sendData = await sendResp.json();
            log.info(`✅ Welcome sent to real phone ${realPhone} via instance ${dispatchInstance}:`, sendData?.key?.id);
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: welcomeForRealPhone,
              direction: 'outbound',
              status: 'sent',
              provider_message_id: sendData?.key?.id || null,
            });
          } else {
            const errText = await sendResp.text();
            log.error(`❌ Failed to send welcome to real phone via ${dispatchInstance}:`, errText);
          }
        } catch (evErr) {
          log.error('❌ Evolution API error dispatching to real phone:', evErr);
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'phone_collected_and_dispatched',
          real_phone: realPhone,
          conversation_id: conversation.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
        
      } else {
        // Invalid phone format, ask again
        log.info('⚠️ Invalid phone format received:', messageContent);
        
        const retryMessage = 
          `Hmm, não consegui identificar um número válido. 🤔\n\n` +
          `Por favor, envie seu número de WhatsApp com DDD (10 ou 11 dígitos).\n` +
          `Exemplo: 11999998888`;
        
        // Get the incoming message ID to reply to
        const retryMsgId = payload.data.key.id;
        
        const retryResult = await sendReplyWithTokenCharge(
          whatsAppConfig,
          phone,
          retryMessage,
          retryMsgId,
          supabase,
          tenantId,
          'receptionist',
          'Recepcionista: retry solicitação telefone',
          conversation.id
        );
        
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          sender_type: 'bot',
          content: retryMessage,
          status: retryResult.success ? 'sent' : 'failed',
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'retry_ask_phone',
          conversation_id: conversation.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check if we are in lead capture state
    if (conversation.lead_capture_state && conversation.lead_capture_state !== 'completed') {
      log.info('📝 Processing lead capture response, state:', conversation.lead_capture_state);
      
      const leadCaptureData = (conversation.lead_capture_data || {}) as Record<string, unknown>;
      
      // Get receptionist config for messages
      const { data: receptionistConfigForCapture } = await supabase
        .from('receptionist_configs')
        .select(RECEPTIONIST_CONFIG_COLUMNS)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (conversation.lead_capture_state === 'awaiting_name') {
        // User responded with their name
        const userName = messageContent.trim();
        log.info('📝 Captured name:', userName);
        
        // Save name and ask for phone
        leadCaptureData.name = userName;
        
        await supabase
          .from('conversations')
          .update({
            lead_capture_state: 'awaiting_phone',
            lead_capture_data: leadCaptureData,
          })
          .eq('id', conversation.id);
        
        // Update contact name
        await supabase
          .from('contacts')
          .update({ name: userName })
          .eq('id', contact.id);
        
        const phoneMessage = (receptionistConfigForCapture?.lead_capture_phone_message || 
          'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:')
          .replace(/{nome}/g, userName);
        
        const phoneResult = await sendTextWithTokenCharge(
          whatsAppConfig,
          phone,
          phoneMessage,
          supabase,
          tenantId,
          'receptionist',
          'Recepcionista: captura de lead - telefone',
          conversation.id
        );
        
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          sender_type: 'bot',
          content: phoneMessage,
          status: phoneResult.success ? 'sent' : 'failed',
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'lead_capture_ask_phone',
          name: userName,
          conversation_id: conversation.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (conversation.lead_capture_state === 'awaiting_phone') {
        // User responded with their phone
        const userPhone = messageContent.replace(/\D/g, '');
        
        // Validate phone format (Brazilian: 10-11 digits with DDD)
        if (userPhone.length >= 10 && userPhone.length <= 13) {
          let normalizedPhone = userPhone;
          if (!normalizedPhone.startsWith('55')) {
            normalizedPhone = '55' + normalizedPhone;
          }
          
          log.info('📝 Captured phone:', normalizedPhone);
          
          leadCaptureData.phone = normalizedPhone;
          const userName = (leadCaptureData.name as string) || 'Cliente';
          
          // Mark lead capture as completed
          await supabase
            .from('conversations')
            .update({
              lead_capture_state: 'completed',
              lead_capture_data: leadCaptureData,
              // Move to target column if configured
              ...(receptionistConfigForCapture?.target_column_id && {
                kanban_column_id: receptionistConfigForCapture.target_column_id,
              }),
            })
            .eq('id', conversation.id);
          
          // Create lead record
          await supabase.from('leads').insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            conversation_id: conversation.id,
            integration_id: integration.id,
            name: userName,
            phone: normalizedPhone,
            source: 'receptionist',
            metadata: {
              original_message: messageContent,
              captured_at: new Date().toISOString(),
            },
          });
          
          log.info('📝 Lead created successfully');
          
          // Send success message
          const successMessage = (receptionistConfigForCapture?.lead_capture_success_message || 
            'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...')
            .replace(/{nome}/g, userName);
          
          const successResult = await sendTextWithTokenCharge(
            whatsAppConfig,
            phone,
            successMessage,
            supabase,
            tenantId,
            'receptionist',
            'Recepcionista: captura de lead - sucesso',
            conversation.id
          );
          
          await supabase.from('messages').insert({
            conversation_id: conversation.id,
            tenant_id: tenantId,
            sender_type: 'bot',
            content: successMessage,
            status: successResult.success ? 'sent' : 'failed',
          });
          
          // Now show the receptionist menu
          if (receptionistConfigForCapture?.is_active) {
            const { success: menuSent, menuText } = await sendReceptionistMenu({
              config: receptionistConfigForCapture,
              whatsAppConfig, phone, contactName: contact.name,
              supabase, tenantId, conversationId: conversation.id,
              tokenDescription: 'Recepcionista: menu após captura de lead',
              skipWelcome: true,
            });

            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: menuText,
              status: menuSent ? 'sent' : 'failed',
            });
          }
          
          return new Response(JSON.stringify({ 
            success: true, 
            action: 'lead_capture_completed',
            lead: { name: userName, phone: normalizedPhone },
            conversation_id: conversation.id,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
          
        } else {
          // Invalid phone format
          log.info('⚠️ Invalid phone format in lead capture:', messageContent);
          
          const retryMessage = 'Não consegui identificar um número válido. Por favor, envie seu telefone com DDD (ex: 11999998888):';
          
          const retryResult = await sendTextWithTokenCharge(
            whatsAppConfig,
            phone,
            retryMessage,
            supabase,
            tenantId,
            'receptionist',
            'Recepcionista: captura de lead - retry telefone',
            conversation.id
          );
          
          await supabase.from('messages').insert({
            conversation_id: conversation.id,
            tenant_id: tenantId,
            sender_type: 'bot',
            content: retryMessage,
            status: retryResult.success ? 'sent' : 'failed',
          });
          
          return new Response(JSON.stringify({ 
            success: true, 
            action: 'lead_capture_retry_phone',
            conversation_id: conversation.id,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Sync with Chatwoot if connected (em background para reduzir latência)
    const chatwootSyncTask = syncWithChatwoot({
      supabase, chatwootPlatformUrl: chatwootPlatformUrl || '',
      tenantId, integrationMeta,
      contact: { id: contact.id, metadata: contact.metadata as Record<string, unknown> | null },
      conversation: { id: conversation.id, chatwoot_conversation_id: conversation.chatwoot_conversation_id },
      message: { id: message.id },
      phone, contactName, messageContent,
    }).catch((chatwootErr) => {
      log.error('❌ Chatwoot sync failed:', chatwootErr);
    });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(chatwootSyncTask);
    } else {
      await chatwootSyncTask;
    }

    // Check if this is a new conversation and receptionist is active
    if (isNewConversation) {
      // For LID contacts WITHOUT real_phone, ask for real phone number before showing receptionist menu
      // If we already have real_phone from remoteJidAlt, skip this step entirely
      const contactMetadata = (contact.metadata || {}) as Record<string, unknown>;
      const hasRealPhone = !!contactMetadata.real_phone;
      
      if (isLidContact && !hasRealPhone) {
        log.info('📱 New LID contact without real_phone, silently awaiting phone number from user...');
        
        // Mark conversation as awaiting phone input (silently - no message sent)
        await supabase
          .from('conversations')
          .update({ awaiting_phone_input: true })
          .eq('id', conversation.id);
        
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'awaiting_phone_silently',
          conversation_id: conversation.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // LID contact with real_phone or normal contact - proceed normally
      if (isLidContact && hasRealPhone) {
        log.info('📱 LID contact already has real_phone from remoteJidAlt, skipping phone request');
      }

      // Check for receptionist config
      const { data: receptionistConfig } = await supabase
        .from('receptionist_configs')
        .select(RECEPTIONIST_CONFIG_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle();

      if (receptionistConfig) {
        log.info('🤵 Receptionist active');
        
        // Check if lead capture is enabled
        if (receptionistConfig.lead_capture_enabled) {
          // CORREÇÃO: Verificar APENAS se já existe um lead na tabela leads
          // NÃO considerar pushName do WhatsApp como "lead capturado"
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id, name, phone')
            .eq('tenant_id', tenantId)
            .eq('contact_id', contact.id)
            .maybeSingle();
          
          // Também verificar se a conversa já passou pelo fluxo de captura (state: completed)
          const leadAlreadyCaptured = existingLead && existingLead.name;
          const captureAlreadyCompleted = conversation.lead_capture_state === 'completed';
          
          if (leadAlreadyCaptured || captureAlreadyCompleted) {
            log.info('📝 Lead already captured, skipping lead capture flow', {
              leadAlreadyCaptured: !!leadAlreadyCaptured,
              captureAlreadyCompleted,
              existingLeadName: existingLead?.name,
            });
            // Skip lead capture - go directly to menu (handled below)
          } else {
            log.info('📝 Lead capture enabled, starting capture flow...');
            
            // Start lead capture - ask for name first
            await supabase
              .from('conversations')
              .update({ 
                lead_capture_state: 'awaiting_name',
                lead_capture_data: {},
              })
              .eq('id', conversation.id);
            
            const nameMessage = receptionistConfig.lead_capture_name_message || 
              'Para um melhor atendimento, qual é o seu nome? 😊';
            
            const nameResult = await sendTextWithTokenCharge(
              whatsAppConfig,
              phone,
              nameMessage,
              supabase,
              tenantId,
              'receptionist',
              'Recepcionista: captura de lead - nome',
              conversation.id
            );
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: nameMessage,
              status: nameResult.success ? 'sent' : 'failed',
            });
            
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'lead_capture_ask_name',
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        
        // No lead capture - send welcome message first, then menu
        log.info('🤵 Sending welcome message + menu...');

        // 1. Send welcome message separately
        const welcomeMsg = replaceMessagePlaceholders(receptionistConfig.welcome_message, contact.name);
        const welcomeResult = await sendTextWithTokenCharge(
          whatsAppConfig, phone, welcomeMsg,
          supabase, tenantId, "receptionist", "Recepcionista: boas-vindas", conversation.id
        );

        // Save welcome message to DB
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          sender_type: 'bot',
          content: welcomeMsg,
          status: welcomeResult.success ? 'sent' : 'failed',
        });

        // 2. Send menu (without welcome text)
        const { success: menuSent, menuText } = await sendReceptionistMenu({
          config: receptionistConfig,
          whatsAppConfig, phone, contactName: contact.name,
          supabase, tenantId, conversationId: conversation.id,
          tokenDescription: 'Recepcionista: menu',
          skipWelcome: true,
        });

        // Save menu message to DB
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          sender_type: 'bot',
          content: menuText,
          status: menuSent ? 'sent' : 'failed',
        });
        
        // Return early - don't trigger AI for the first message when receptionist handles it
        return new Response(JSON.stringify({ 
          success: true, 
          contact_id: contact.id,
          conversation_id: conversation.id,
          message_id: message.id,
          receptionist: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Check if this is a receptionist button/list click
    if (buttonClickId && buttonClickId.startsWith('receptionist_')) {
      log.info('🤵 Receptionist menu option selected:', buttonClickId);
      
      const { data: receptionistConfig } = await supabase
        .from('receptionist_configs')
        .select(RECEPTIONIST_CONFIG_COLUMNS)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (receptionistConfig) {
        const optionId = buttonClickId.replace('receptionist_', '');
        const menuOptions = receptionistConfig.menu_options as Array<{
          id: string;
          label: string;
          action_type: string;
          target_column_id?: string;
          response_message?: string;
        }>;
        
        const selectedOption = menuOptions.find(opt => opt.id === optionId);
        
        if (selectedOption) {
          if (selectedOption.action_type === 'transfer_to_human') {
            // Transfer to human
            await supabase
              .from('conversations')
              .update({ 
                status: 'pending',
                ai_enabled: false,
                current_ai_agent_id: null,
                ...(selectedOption.target_column_id && { kanban_column_id: selectedOption.target_column_id }),
              })
              .eq('id', conversation.id);
            
            const handoffMessage = receptionistConfig.human_handoff_message || 
              'Aguarde, um atendente irá te atender em breve.';
            
            // Send handoff message with token charge
            const handoffResult = await sendTextWithTokenCharge(
              whatsAppConfig,
              phone,
              handoffMessage,
              supabase,
              tenantId,
              'receptionist',
              'Recepcionista: transferência para humano',
              conversation.id
            );
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: handoffMessage,
              status: handoffResult.success ? 'sent' : 'failed',
            });
            
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'receptionist_transfer_human',
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          if (selectedOption.action_type === 'transfer_to_column' && selectedOption.target_column_id) {
            // Move to specific column AND reset AI agent to let new column's agent take over
            // Also reset verification_state to allow new agent to initialize its verification flow
            await supabase
              .from('conversations')
              .update({ 
                kanban_column_id: selectedOption.target_column_id,
                current_ai_agent_id: null,
                buffered_message_ids: [],
                verification_state: null,
                verification_data: null,
              })
              .eq('id', conversation.id);
            
            // Sync in-memory object for subsequent AI lookup
            conversation.kanban_column_id = selectedOption.target_column_id;
            conversation.current_ai_agent_id = null;
            
            log.info('📋 Conversation moved to column:', selectedOption.target_column_id, '(AI agent reset)');
            
            // For column transfers, we skip the receptionist response_message here.
            // The target column's AI agent (e.g., Especialista em Pedidos) will send its own welcome/flow message.

            log.info('📋 Calling ai-chat for agent initialization after column transfer');

            try {
              await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  conversation_id: conversation.id,
                  tenant_id: tenantId,
                  contact_phone: phone,
                  integration_id: integration.id,
                  initialization_only: true,
                }),
              });
            } catch (initError) {
              log.error('📋 Error calling ai-chat for initialization:', initError);
            }

            return new Response(JSON.stringify({
              success: true,
              action: 'receptionist_transfer_to_column',
              column_id: selectedOption.target_column_id,
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          if (selectedOption.action_type === 'send_message' && selectedOption.response_message) {
            // Send pre-configured response with token charge
            const msgResult = await sendTextWithTokenCharge(
              whatsAppConfig,
              phone,
              selectedOption.response_message,
              supabase,
              tenantId,
              'receptionist',
              'Recepcionista: resposta de opção do menu',
              conversation.id
            );
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: selectedOption.response_message,
              status: msgResult.success ? 'sent' : 'failed',
            });
            
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'receptionist_send_message',
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }
    
    // Check for menu trigger keywords (to re-show receptionist menu) or NUMERIC responses
    const { data: receptionistConfig } = await supabase
      .from('receptionist_configs')
      .select(RECEPTIONIST_CONFIG_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (receptionistConfig && !buttonClickId) {
      const triggerKeywords = (receptionistConfig.menu_trigger_keywords as string[]) || ['menu', 'opções'];
      const messageLower = messageContent.toLowerCase().trim();
      const shouldShowMenu = triggerKeywords.some(kw => messageLower === kw.toLowerCase());
      
      const menuOptions = receptionistConfig.menu_options as Array<{
        id: string;
        label: string;
        action_type: string;
        target_column_id?: string;
        response_message?: string;
      }>;
      
      // Check if message is a numeric response to the menu (e.g., "1", "2", "3", "4")
      const numericMatch = messageLower.match(/^(\d+)$/);
      
      if (numericMatch && menuOptions.length > 0) {
        const selectedNumber = parseInt(numericMatch[1], 10);
        
        // Options are 1-indexed for the user
        if (selectedNumber >= 1 && selectedNumber <= menuOptions.length) {
          const selectedOption = menuOptions[selectedNumber - 1];
          
          log.info(`🔢 Numeric menu selection detected: ${selectedNumber} -> "${selectedOption.label}" (action: ${selectedOption.action_type})`);
          
          // Execute the receptionist action based on action_type
          if (selectedOption.action_type === 'transfer_to_human') {
            // Transfer to human
            await supabase
              .from('conversations')
              .update({ 
                status: 'pending',
                ai_enabled: false,
                current_ai_agent_id: null,
                ...(selectedOption.target_column_id && { kanban_column_id: selectedOption.target_column_id }),
              })
              .eq('id', conversation.id);
            
            const handoffMessage = receptionistConfig.human_handoff_message || 
              'Aguarde, um atendente irá te atender em breve.';
            
            // Send handoff message with token charge
            const handoffResult = await sendTextWithTokenCharge(
              whatsAppConfig,
              phone,
              handoffMessage,
              supabase,
              tenantId,
              'receptionist',
              'Recepcionista: transferência para humano (numérico)',
              conversation.id
            );
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: handoffMessage,
              status: handoffResult.success ? 'sent' : 'failed',
            });
            
            log.info('🤵 Numeric selection: transferred to human');
            
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'receptionist_numeric_transfer_human',
              selected_option: selectedOption.label,
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          if (selectedOption.action_type === 'transfer_to_column' && selectedOption.target_column_id) {
            // Move to specific column AND reset AI agent to let new column's agent take over
            // Also reset verification_state to allow new agent to initialize its verification flow
            await supabase
              .from('conversations')
              .update({ 
                kanban_column_id: selectedOption.target_column_id,
                current_ai_agent_id: null,
                buffered_message_ids: [],
                verification_state: null,
                verification_data: null,
              })
              .eq('id', conversation.id);
            
            // Sync in-memory object for subsequent AI lookup
            conversation.kanban_column_id = selectedOption.target_column_id;
            conversation.current_ai_agent_id = null;
            
            log.info('🤵 Numeric selection: moved to column:', selectedOption.target_column_id, '(AI agent reset)');
            
            // For column transfers, we skip the receptionist response_message here.
            // The target column's AI agent will send its own welcome/flow message.
            log.info('🤵 Skipping receptionist response_message on numeric column transfer');
            // Call AI for initialization only (don't process "1" as a question)
            log.info('🤵 Calling ai-chat for agent initialization after column transfer');
            
            try {
              await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  conversation_id: conversation.id,
                  tenant_id: tenantId,
                  contact_phone: phone,
                  integration_id: integration.id,
                  initialization_only: true,
                }),
              });
            } catch (initError) {
              log.error('🤵 Error calling ai-chat for initialization:', initError);
            }
            
            // Return early - don't process numeric selection as a question for AI
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'receptionist_transfer_to_column',
              column_id: selectedOption.target_column_id,
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          if (selectedOption.action_type === 'send_message' && selectedOption.response_message) {
            // Send pre-configured response with token charge
            const msgResult = await sendTextWithTokenCharge(
              whatsAppConfig,
              phone,
              selectedOption.response_message,
              supabase,
              tenantId,
              'receptionist',
              'Recepcionista: resposta numérica',
              conversation.id
            );
            
            await supabase.from('messages').insert({
              conversation_id: conversation.id,
              tenant_id: tenantId,
              sender_type: 'bot',
              content: selectedOption.response_message,
              status: msgResult.success ? 'sent' : 'failed',
            });
            
            log.info('🤵 Numeric selection: sent response message');
            
            return new Response(JSON.stringify({ 
              success: true, 
              action: 'receptionist_numeric_send_message',
              selected_option: selectedOption.label,
              conversation_id: conversation.id,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
      
      if (shouldShowMenu) {
        log.info('🤵 Menu trigger keyword detected, re-showing menu (no welcome)...');
        
        const { success: menuSent, menuText } = await sendReceptionistMenu({
          config: receptionistConfig,
          whatsAppConfig, phone, contactName: contact.name,
          supabase, tenantId, conversationId: conversation.id,
          tokenDescription: 'Recepcionista: menu re-exibido',
          skipWelcome: true,
        });
        
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          tenant_id: tenantId,
          sender_type: 'bot',
          content: menuText,
          status: menuSent ? 'sent' : 'failed',
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'receptionist_menu_reshown',
          conversation_id: conversation.id,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // ── AUTOMATION CONVERSATION GUARD ──────────────────────────────
    // If this conversation was created by an automation (cashback, order notification, etc.),
    // do NOT trigger the bot or AI. Just save the message and let the auto-close handle it.
    if (conversation.source === 'automation') {
      log.info('🤖 Automation conversation — skipping bot/AI response');
      
      // Update last_message_at for auto-close timer tracking
      await supabase
        .from('conversations')
        .update({ 
          last_message_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      return new Response(JSON.stringify({ 
        success: true, 
        action: 'automation_conversation_no_bot',
        conversation_id: conversation.id,
        message_id: message.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GLOBAL MENU INTERCEPT ──────────────────────────────────────
    // If conversation is in handoff (human agent) mode but user typed a menu keyword,
    // call the bot-engine so it can re-activate the bot and show the menu.
    const menuKeywords = ['menu', 'voltar', 'inicio', 'início', '0'];
    const lowerMsgForMenu = messageContent.toLowerCase().trim();
    const userWantsMenu = menuKeywords.includes(lowerMsgForMenu);

    if (userWantsMenu && (conversation.handoff_mode || !conversation.ai_enabled) && conversation.status !== 'closed') {
      log.info('📋 User typed menu keyword while in handoff/disabled — routing to bot-engine');
      
      // Check if inbox has bot_enabled
      let inboxBotEnabled = false;
      if (conversation.inbox_id) {
        const { data: inboxCheckMenu } = await supabase
          .from('inboxes')
          .select('bot_enabled')
          .eq('id', conversation.inbox_id)
          .maybeSingle();
        inboxBotEnabled = inboxCheckMenu?.bot_enabled || false;
      }

      if (inboxBotEnabled) {
        try {
          const botMenuResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              conversation_id: conversation.id,
              message_id: message.id,
              message_content: messageContent,
              contact_name: contactName || contact.name || '',
              button_click_id: buttonClickId || null,
            }),
          });
          const botMenuResult = await botMenuResponse.json();
          log.info('📋 Bot-engine menu intercept result:', botMenuResult);
        } catch (botMenuErr) {
          log.error('❌ Bot-engine menu intercept error:', botMenuErr);
        }
      } else {
        // No bot-engine: reset conversation state directly so next message hits bot
        log.info('📋 No bot-engine available — resetting conversation to bot mode directly');
        await supabase.from('conversations').update({
          handoff_mode: false,
          ai_enabled: true,
          status: 'bot',
          bot_state_json: { stage: 'menu', context: {} },
        }).eq('id', conversation.id);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        action: 'menu_intercept_from_handoff',
        conversation_id: conversation.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If AI is enabled for this conversation, trigger AI response
    if (conversation.ai_enabled && conversation.status === 'bot') {
      // Check global AI config for tenant
      const { data: aiConfig } = await supabase
        .from('ai_assistant_configs')
        .select('is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const globalAIEnabled = aiConfig?.is_active !== false; // Default to true if no config

      if (globalAIEnabled) {
        // Check if the current AI agent has message buffering enabled
        let bufferEnabled = false;
        let bufferDelaySeconds = 3;
        
        let currentAgentId = conversation.current_ai_agent_id;
        
        // If no agent defined, find one from column assignment (same fallback as ai-chat)
        if (!currentAgentId && conversation.kanban_column_id) {
          log.info('📍 No current_ai_agent_id, looking up agent from column:', conversation.kanban_column_id);
          
          const { data: columnAssignment } = await supabase
            .from('ai_agent_column_assignments')
            .select('agent_id')
            .eq('column_id', conversation.kanban_column_id)
            .order('priority', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (columnAssignment?.agent_id) {
            currentAgentId = columnAssignment.agent_id;
            log.info('📍 Found AI agent from column assignment:', currentAgentId);
            
            // Update conversation for future checks
            await supabase
              .from('conversations')
              .update({ current_ai_agent_id: currentAgentId })
              .eq('id', conversation.id);
          }
        }
        
        if (currentAgentId) {
          const { data: currentAgent } = await supabase
            .from('ai_agents')
            .select('message_buffer_enabled, message_buffer_delay_seconds')
            .eq('id', currentAgentId)
            .single();
          
          if (currentAgent) {
            bufferEnabled = currentAgent.message_buffer_enabled || false;
            bufferDelaySeconds = currentAgent.message_buffer_delay_seconds ?? 3;
            // Reduz atraso percebido sem eliminar o buffer completamente
            bufferDelaySeconds = Math.max(1, Math.min(bufferDelaySeconds, 5));
            log.info(`📍 Agent buffer settings - enabled: ${bufferEnabled}, delay: ${bufferDelaySeconds}s`);
          }
        }
        
        if (bufferEnabled) {
          // Buffer mode: accumulate messages and delay AI response
          log.info(`⏳ Buffer mode active. Waiting ${bufferDelaySeconds}s for more messages...`);
          
          // CORREÇÃO: Usar função atômica para evitar race condition
          const { error: bufferError } = await supabase.rpc('add_message_to_buffer', {
            _conversation_id: conversation.id,
            _message_id: message.id,
            _delay_seconds: bufferDelaySeconds
          });

          if (bufferError) {
            log.error('❌ Error adding message to buffer:', bufferError);
          } else {
            log.info(`📝 Message buffered atomically. AI will respond in ${bufferDelaySeconds}s`);
          }
          
          // Schedule the buffer processor to run after the delay using waitUntil
          // This ensures precise timing instead of waiting for the cron job
          const scheduleBufferProcessing = async () => {
            // Wait for the exact buffer delay
            await new Promise(resolve => setTimeout(resolve, bufferDelaySeconds * 1000));
            
            log.info(`⏰ Buffer delay elapsed for conversation ${conversation.id}, triggering processor...`);
            
            // Call the buffer processor
            try {
              await fetch(`${supabaseUrl}/functions/v1/ai-buffer-processor`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({ triggered_by: 'webhook_waitUntil', conversation_id: conversation.id }),
              });
            } catch (e) {
              log.error('❌ Error calling buffer processor:', e);
            }
          };
          
          // Use EdgeRuntime.waitUntil to run in background after response is sent
          if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
            EdgeRuntime.waitUntil(scheduleBufferProcessing());
            log.info(`🚀 Scheduled buffer processing in ${bufferDelaySeconds}s via waitUntil`);
          } else {
            // Fallback: just log, cron will pick it up
            log.info(`📋 waitUntil not available, relying on cron job`);
          }
        } else {
          // Normal mode: check if bot-engine should handle first
          // Bot-engine handles: welcome menu, interactive buttons, keyword rules, state machine
          // If bot-engine returns delegate_to_ai, then call ai-chat
          
          let shouldCallAI = true;
          
          // Check if inbox has bot_enabled - if so, route through bot-engine first
          if (conversation.inbox_id) {
            const { data: inboxCheck } = await supabase
              .from('inboxes')
              .select('bot_enabled')
              .eq('id', conversation.inbox_id)
              .maybeSingle();
            
            if (inboxCheck?.bot_enabled) {
              log.info('🤖 Bot enabled on inbox, calling bot-engine first...');
              try {
                const botResponse = await fetch(`${supabaseUrl}/functions/v1/bot-engine`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    conversation_id: conversation.id,
                    message_id: message.id,
                    message_content: messageContent,
                    contact_name: contactName || contact.name || '',
                    button_click_id: buttonClickId || null,
                  }),
                });
                const botResult = await botResponse.json();
                log.info('🤖 Bot-engine result:', botResult);
                
                // Only call ai-chat if bot-engine explicitly delegates
                if (botResult.action === 'delegate_to_ai') {
                  log.info('🧠 Bot-engine delegated to AI, calling ai-chat...');
                  shouldCallAI = true;
                } else {
                  // Bot-engine handled it (menu, keyword rule, transfer, etc.)
                  shouldCallAI = false;
                }
              } catch (botErr) {
                log.error('❌ Bot-engine error, falling back to ai-chat:', botErr);
                shouldCallAI = true;
              }
            }
          }
          
          if (shouldCallAI) {
            log.info('🤖 Triggering AI response...');
            const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                conversation_id: conversation.id,
                message_id: message.id,
                tenant_id: tenantId,
                contact_phone: phone,
                integration_id: integration.id,
                button_click_id: buttonClickId || null,
              }),
            });
            const aiResult = await aiResponse.json();
            log.info('🤖 AI response result:', aiResult);
          }
        }
      } else {
        log.info('⏸️ AI is globally disabled for this tenant, skipping auto-response');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      contact_id: contact.id,
      conversation_id: conversation.id,
      message_id: message.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    log.error('❌ Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});