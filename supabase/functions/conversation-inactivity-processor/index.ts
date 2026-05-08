import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { startTimer, recordMetrics } from "../_shared/metrics.ts";

interface AIAgent {
  id: string;
  inactivity_enabled: boolean;
  inactivity_timeout_minutes: number | null;
  inactivity_target_column_id: string | null;
  inactivity_message: string | null;
}

interface Conversation {
  id: string;
  contact_id: string;
  integration_id: string | null;
  tenant_id: string;
  last_message_at: string;
  current_ai_agent_id: string | null;
  contacts: { phone: string; name: string | null };
}

interface TenantConfig {
  timeout: number;
  message: string;
  defaultAgentId: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("conversation-inactivity-processor", cid);
  const elapsed = startTimer();

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.info('Starting inactivity processor');

    // Get all active conversations that might be inactive
    const { data: activeConversations, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        contact_id,
        integration_id,
        tenant_id,
        last_message_at,
        current_ai_agent_id,
        contacts!inner(phone, name)
      `)
      .in('status', ['bot', 'open', 'pending'])
      .is('closed_at', null);

    if (convError) {
      log.error('Error fetching conversations', { error: convError.message });
      throw convError;
    }

    if (!activeConversations || activeConversations.length === 0) {
      log.info('No active conversations to check');
      await recordMetrics({ functionName: "conversation-inactivity-processor", correlationId: cid, status: "ok", durationMs: elapsed(), itemsProcessed: 0 });
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info('Found active conversations to check', { count: activeConversations.length });

    // Get all AI agents with inactivity enabled
    const { data: agentsWithInactivity, error: agentsError } = await supabase
      .from('ai_agents')
      .select('id, inactivity_enabled, inactivity_timeout_minutes, inactivity_target_column_id, inactivity_message')
      .eq('inactivity_enabled', true)
      .not('inactivity_timeout_minutes', 'is', null);

    if (agentsError) {
      log.error('Error fetching agents', { error: agentsError.message });
    }

    const agentsMap = new Map<string, AIAgent>();
    (agentsWithInactivity || []).forEach((agent) => {
      agentsMap.set(agent.id, agent as AIAgent);
    });

    // Get all tenant global configs as fallback
    const { data: tenantConfigs, error: configsError } = await supabase
      .from('ai_assistant_configs')
      .select('tenant_id, inactivity_timeout_minutes, inactivity_message, default_ai_agent_id')
      .not('inactivity_timeout_minutes', 'is', null);

    if (configsError) {
      log.error('Error fetching tenant configs', { error: configsError.message });
    }

    const tenantConfigsMap = new Map<string, TenantConfig>();
    (tenantConfigs || []).forEach((config) => {
      tenantConfigsMap.set(config.tenant_id, {
        timeout: config.inactivity_timeout_minutes,
        message: config.inactivity_message || 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!',
        defaultAgentId: config.default_ai_agent_id,
      });
    });

    // Cache for closed columns per tenant
    const closedColumnsCache = new Map<string, string | null>();

    const getClosedColumn = async (tenantId: string): Promise<string | null> => {
      if (closedColumnsCache.has(tenantId)) {
        return closedColumnsCache.get(tenantId) || null;
      }

      const { data: allColumns } = await supabase
        .from('kanban_columns')
        .select('id, name, position')
        .eq('tenant_id', tenantId)
        .order('position', { ascending: false });

      let closedColumnId: string | null = null;
      
      if (allColumns && allColumns.length > 0) {
        const closedKeywords = ['resolvido', 'finalizado', 'encerrado', 'fechado', 'closed', 'done'];
        const keywordColumn = allColumns.find(col => 
          closedKeywords.some(keyword => col.name.toLowerCase().includes(keyword))
        );
        closedColumnId = keywordColumn?.id || allColumns[0]?.id || null;
      }

      closedColumnsCache.set(tenantId, closedColumnId);
      return closedColumnId;
    };

    let totalProcessed = 0;
    let totalFailed = 0;
    const now = new Date();

    for (const conv of activeConversations) {
      try {
        const conversation = conv as unknown as Conversation;
        const tenantId = conversation.tenant_id;
        const lastMessageAt = new Date(conversation.last_message_at);

        // Determine inactivity settings - priority: agent > tenant global
        let timeoutMinutes: number | null = null;
        let inactivityMessage: string | null = null;
        let targetColumnId: string | null = null;

        // Check if conversation has an AI agent with inactivity settings
        if (conversation.current_ai_agent_id && agentsMap.has(conversation.current_ai_agent_id)) {
          const agent = agentsMap.get(conversation.current_ai_agent_id)!;
          timeoutMinutes = agent.inactivity_timeout_minutes;
          inactivityMessage = agent.inactivity_message;
          targetColumnId = agent.inactivity_target_column_id;
        } 
        // Fallback to tenant global config
        else if (tenantConfigsMap.has(tenantId)) {
          const config = tenantConfigsMap.get(tenantId)!;
          timeoutMinutes = config.timeout;
          inactivityMessage = config.message;
        }

        // Skip if no inactivity config
        if (!timeoutMinutes) {
          continue;
        }

        // Check if conversation is inactive
        const cutoffTime = new Date(now.getTime() - timeoutMinutes * 60 * 1000);
        
        if (lastMessageAt >= cutoffTime) {
          continue;
        }

        log.info('Conversation inactive', { conversationId: conversation.id, lastMessageAt: lastMessageAt.toISOString(), cutoff: cutoffTime.toISOString() });

        const contactData = conversation.contacts;
        const phone = contactData.phone;

        // Determine target column
        if (!targetColumnId) {
          targetColumnId = await getClosedColumn(tenantId);
        }

        const defaultMessage = 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!';
        const messageToSend = inactivityMessage || defaultMessage;

        // Get integration details for sending message
        if (conversation.integration_id && evolutionApiUrl && evolutionApiKey) {
          const { data: integration } = await supabase
            .from('integrations')
            .select('metadata')
            .eq('id', conversation.integration_id)
            .single();

          if (integration?.metadata) {
            const metadata = integration.metadata as { instanceName?: string };
            const instanceName = metadata.instanceName;

            if (instanceName) {
              // Check token balance before sending (1 token required)
              const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { 
                _tenant_id: tenantId, 
                _amount: 1 
              });

              if (!hasTokens) {
                log.warn('Insufficient tokens for inactivity message', { conversationId: conversation.id, tenantId });
              } else {
                // Send inactivity message
                try {
                  const sendResponse = await fetch(
                    `${evolutionApiUrl}/message/sendText/${instanceName}`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'apikey': evolutionApiKey,
                      },
                      body: JSON.stringify({
                        number: phone,
                        text: messageToSend,
                      }),
                    }
                  );

                  if (sendResponse.ok) {
                    log.info('Inactivity message sent', { phone, conversationId: conversation.id });

                    // Deduct 1 token for auto message sent
                    const { data: deducted, error: deductError } = await supabase.rpc('deduct_tokens', {
                      _tenant_id: tenantId,
                      _amount: 1,
                      _type: 'auto_message',
                      _description: 'Mensagem de encerramento por inatividade',
                      _reference_id: conversation.id
                    });

                    if (deductError) {
                      log.error('Error deducting tokens', { error: deductError.message, tenantId });
                    } else if (!deducted) {
                      log.warn('Token deduction returned false', { tenantId });
                    }

                    // Save the message to database
                    await supabase.from('messages').insert({
                      conversation_id: conversation.id,
                      tenant_id: tenantId,
                      sender_type: 'bot',
                      content: messageToSend,
                      content_type: 'text',
                      metadata: { type: 'inactivity_closure' },
                    });
                  } else {
                    log.warn('Failed to send inactivity message', { status: sendResponse.status, conversationId: conversation.id });
                  }
                } catch (sendError) {
                  log.error('Error sending message', { phone, error: sendError instanceof Error ? sendError.message : String(sendError) });
                }
              }
            }
          }
        }

        // Get tenant's default AI agent for resetting
        const tenantConfig = tenantConfigsMap.get(tenantId);
        const defaultAgentId = tenantConfig?.defaultAgentId || null;

        // Close the conversation - move to target column
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            assigned_to: null,
            ai_enabled: true,
            kanban_column_id: targetColumnId,
            current_ai_agent_id: defaultAgentId,
            bot_state_json: null,
            buffered_message_ids: [],
            pending_ai_response_at: null,
          })
          .eq('id', conversation.id);

        if (updateError) {
          log.error('Error closing conversation', { conversationId: conversation.id, error: updateError.message });
          totalFailed++;
        } else {
          log.info('Conversation closed due to inactivity', { conversationId: conversation.id });
          totalProcessed++;
        }
      } catch (convError) {
        log.error('Error processing conversation', { conversationId: conv.id, error: convError instanceof Error ? convError.message : String(convError) });
        totalFailed++;
      }
    }

    log.info('Inactivity processor completed', { processed: totalProcessed, failed: totalFailed });
    await recordMetrics({ functionName: "conversation-inactivity-processor", correlationId: cid, status: "ok", durationMs: elapsed(), itemsProcessed: totalProcessed, itemsFailed: totalFailed });

    return new Response(JSON.stringify({ success: true, processed: totalProcessed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Fatal error in inactivity processor', { error: errorMessage });
    await recordMetrics({ functionName: "conversation-inactivity-processor", correlationId: cid, status: "error", durationMs: elapsed(), errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
