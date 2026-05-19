import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { parseMessageContent } from "../_shared/wa-webhook-message-parser.ts";
import { syncWithChatwoot } from "../_shared/wa-webhook-chatwoot-sync.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import type { IntegrationMetadata, EvolutionStatusUpdate, WaCtx } from "../_shared/wa-webhook-types.ts";
import { resolveLidPhone } from "../_shared/wa-webhook-lid-processor.ts";
import { findOrCreateContact } from "../_shared/wa-webhook-contact-manager.ts";
import { findOrCreateConversation } from "../_shared/wa-webhook-conversation-manager.ts";
import { handleLidPhoneCapture } from "../_shared/wa-webhook-lid-phone-capture.ts";
import { handleLeadCapture } from "../_shared/wa-webhook-lead-capture.ts";
import {
  handleNewConversationReceptionist,
  handleReceptionistButtonClick,
} from "../_shared/wa-webhook-receptionist-handler.ts";
import { handleMenuTrigger } from "../_shared/wa-webhook-menu-trigger.ts";
import { routeToAI } from "../_shared/wa-webhook-ai-routing.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void } | undefined;

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("whatsapp-webhook", cid);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const chatwootPlatformUrl = Deno.env.get('CHATWOOT_PLATFORM_URL') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
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
            updated_at: new Date().toISOString(),
          })
          .eq('metadata->>whatsapp_message_id', key.id);
        if (statusError) log.error('⚠️ Error updating message status:', statusError);
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

    const instanceName: string = payload.instance;

    // Fetch integration early — needed for LID phone number filtering
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, tenant_id, metadata')
      .in('type', ['evolution_api', 'evolution_whatsapp'])
      .eq('status', 'connected')
      .filter('metadata->>instanceName', 'eq', instanceName)
      .single();

    if (integrationError || !integration) {
      log.error('❌ Integration not found for instance:', instanceName);
      return new Response(JSON.stringify({ error: 'Integration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const integrationMeta = integration.metadata as IntegrationMetadata;
    const instancePhoneNumber = integrationMeta?.phoneNumber || '';
    log.info('📞 Instance phone number for filtering:', instancePhoneNumber || 'NOT_SET');

    // Resolve phone (handles LID contacts and normal contacts)
    const { phone, isLidContact, lidIdentifier, realPhoneFromAlt } = await resolveLidPhone(
      supabase, payload, integration, instanceName, instancePhoneNumber, log,
    );

    // Parse message content
    const { text: messageContent, contentType, mediaUrl, buttonClickId } = parseMessageContent(payload);
    if (buttonClickId) log.info(`🔘 Button/list clicked: ${buttonClickId} - "${messageContent}"`);

    if (!messageContent) {
      log.info('⏭️ Skipping: no message content');
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`📱 Message from ${phone}: ${messageContent}`);
    log.info(`🏢 Tenant ID: ${integration.tenant_id}`);

    const whatsAppConfig: WhatsAppConfig = {
      evolutionApiUrl: Deno.env.get('EVOLUTION_API_URL')!,
      evolutionApiKey: Deno.env.get('EVOLUTION_API_KEY')!,
      instanceName: integrationMeta?.instanceName || instanceName,
    };

    const contactName = payload.data.pushName || (isLidContact ? `Lead ${phone.replace('@lid', '').slice(-4)}` : phone);
    const ctxCorsHeaders = { ...corsHeaders, 'Content-Type': 'application/json' } as Record<string, string>;

    const ctx: WaCtx = {
      supabase,
      supabaseUrl,
      supabaseServiceKey,
      log,
      corsHeaders: ctxCorsHeaders,
      chatwootPlatformUrl,
      tenantId: integration.tenant_id,
      integration,
      integrationMeta,
      instanceName,
      whatsAppConfig,
      phone,
      contactName,
      isLidContact,
      lidIdentifier,
      realPhoneFromAlt,
      contact: null as any,
      conversation: null as any,
      message: null as any,
      isNewConversation: false,
      messageContent,
      contentType,
      mediaUrl,
      buttonClickId,
      payload,
    };

    // ── Handler pipeline ──────────────────────────────────────────────
    let result: Response | null;

    result = await findOrCreateContact(ctx);
    if (result) return result;

    result = await findOrCreateConversation(ctx);
    if (result) return result;

    // Chatwoot sync runs in background to reduce latency
    const chatwootSyncTask = syncWithChatwoot({
      supabase,
      chatwootPlatformUrl,
      tenantId: ctx.tenantId,
      integrationMeta,
      contact: { id: ctx.contact.id, metadata: ctx.contact.metadata as Record<string, unknown> | null },
      conversation: { id: ctx.conversation.id, chatwoot_conversation_id: ctx.conversation.chatwoot_conversation_id },
      message: { id: ctx.message.id },
      phone,
      contactName,
      messageContent,
    }).catch((err) => { log.error('❌ Chatwoot sync failed:', err); });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(chatwootSyncTask);
    } else {
      await chatwootSyncTask;
    }

    result = await handleLidPhoneCapture(ctx);
    if (result) return result;

    result = await handleLeadCapture(ctx);
    if (result) return result;

    result = await handleNewConversationReceptionist(ctx);
    if (result) return result;

    result = await handleReceptionistButtonClick(ctx);
    if (result) return result;

    result = await handleMenuTrigger(ctx);
    if (result) return result;

    result = await routeToAI(ctx);
    if (result) return result;

    return new Response(JSON.stringify({
      success: true,
      contact_id: ctx.contact.id,
      conversation_id: ctx.conversation.id,
      message_id: ctx.message.id,
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
