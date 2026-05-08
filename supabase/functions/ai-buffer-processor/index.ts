import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("ai-buffer-processor", cid);

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.info("Starting");

    const { data: pendingConversations, error: fetchError } = await supabase
      .from('conversations')
      .select(`
        id,
        tenant_id,
        contact_id,
        integration_id,
        current_ai_agent_id,
        pending_ai_response_at,
        buffered_message_ids,
        contacts!inner(phone)
      `)
      .not('pending_ai_response_at', 'is', null)
      .lte('pending_ai_response_at', new Date().toISOString())
      .not('buffered_message_ids', 'eq', '{}')
      .eq('status', 'bot')
      .eq('ai_enabled', true);

    if (fetchError) {
      log.error("Error fetching pending conversations", { error: fetchError.message });
      throw fetchError;
    }

    if (!pendingConversations || pendingConversations.length === 0) {
      log.info("No pending buffered messages");
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info("Found conversations with buffered messages", { count: pendingConversations.length });

    let processedCount = 0;

    for (const conversation of pendingConversations) {
      try {
        const bufferedIds = conversation.buffered_message_ids as string[];
        
        if (!bufferedIds || bufferedIds.length === 0) {
          log.info("Skipping conversation: no buffered messages", { conversationId: conversation.id });
          continue;
        }

        log.info("Processing conversation", { conversationId: conversation.id, bufferedCount: bufferedIds.length });

        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('id, content, content_type, created_at')
          .in('id', bufferedIds)
          .order('created_at', { ascending: true });

        if (messagesError) {
          log.error("Error fetching messages", { conversationId: conversation.id, error: messagesError.message });
          continue;
        }

        if (!messages || messages.length === 0) {
          log.info("No messages found for buffered IDs", { conversationId: conversation.id });
          await supabase
            .from('conversations')
            .update({ pending_ai_response_at: null, buffered_message_ids: [] })
            .eq('id', conversation.id);
          continue;
        }

        const combinedContent = messages
          .map(m => m.content)
          .filter(Boolean)
          .join('\n');

        log.info("Combined messages", { conversationId: conversation.id, msgCount: messages.length, contentLen: combinedContent.length });

        const contacts = conversation.contacts as { phone: string }[] | { phone: string } | null;
        let contactPhone: string | undefined;
        
        if (Array.isArray(contacts) && contacts.length > 0) {
          contactPhone = contacts[0].phone;
        } else if (contacts && typeof contacts === 'object' && 'phone' in contacts) {
          contactPhone = (contacts as { phone: string }).phone;
        }

        if (!contactPhone) {
          log.error("No contact phone", { conversationId: conversation.id });
          continue;
        }

        await supabase
          .from('conversations')
          .update({ pending_ai_response_at: null, buffered_message_ids: [] })
          .eq('id', conversation.id);

        const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'x-correlation-id': cid,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_id: messages[messages.length - 1].id,
            tenant_id: conversation.tenant_id,
            contact_phone: contactPhone,
            integration_id: conversation.integration_id,
            combined_message_content: combinedContent,
          }),
        });

        const aiResult = await aiResponse.json();
        log.info("AI response", { conversationId: conversation.id, success: aiResult.success ?? false });

        processedCount++;
      } catch (convError) {
        log.error("Error processing conversation", { conversationId: conversation.id, error: convError instanceof Error ? convError.message : String(convError) });
      }
    }

    log.info("Completed", { processed: processedCount, totalPending: pendingConversations.length });

    return new Response(JSON.stringify({ 
      success: true, 
      processed: processedCount,
      total_pending: pendingConversations.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    log.error("Buffer processor error", { error: error instanceof Error ? error.message : String(error) });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
