import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import type { Json } from "@/integrations/supabase/types";
import { onePerContact } from "./useConversationTimeline";

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  avatar_url: string | null;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  inbox_id: string | null;
  channel_id: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  handoff_mode: boolean;
  ai_enabled: boolean;
  bot_state_json: { stage: string; context: Record<string, unknown> } | null;
  current_ai_agent_id: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  source: string;
  created_at: string;
  contact?: Contact;
  last_message_preview?: string;
  ai_sentiment?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  content_type: string;
  sender_type: string;
  direction: string;
  type: string;
  status: string;
  media_url: string | null;
  provider_message_id: string | null;
  error_json: Json | null;
  created_at: string;
}

export interface ConversationFilters {
  status?: string;
  search?: string;
  tagIds?: string[];
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Subscribes to realtime conversation changes for the current tenant and
 * invalidates every `['atendimentos-conversations', tenantId, ...]` query
 * (React Query partial-key match) so all callers refetch.
 *
 * Call this ONCE near the top of the Atendimentos page tree. Multiple calls
 * create redundant realtime channels — `useConversations` itself does NOT
 * subscribe.
 */
export function useConversationsRealtime() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`atendimentos-conv-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations', tenantId] }); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);
}

export function useConversations(inboxId: string | null, filters?: ConversationFilters) {
  const { tenantId } = useAuth();

  const { data: conversations = [], isLoading, refetch } = useQuery({
    queryKey: ['atendimentos-conversations', tenantId, inboxId, filters],
    queryFn: async () => {
      if (!tenantId) return [];
      
      // If filtering by tags, first get matching conversation_ids
      let tagConversationIds: string[] | null = null;
      if (filters?.tagIds && filters.tagIds.length > 0) {
        const { data: tagData } = await supabase
          .from('conversation_tags')
          .select('conversation_id')
          .in('tag_id', filters.tagIds);
        tagConversationIds = [...new Set((tagData || []).map((r) => r.conversation_id))];
        if (tagConversationIds.length === 0) return []; // No matches
      }

      // Busca no servidor (nome, telefone e texto das mensagens), em todo o historico e nao so nas 100 mais recentes.
      let searchOr: string | null = null;
      const term = filters?.search?.trim().replace(/[%,()*]/g, ' ').trim();
      if (term) {
        const digits = term.replace(/\D/g, '');
        const [byContact, byMessage] = await Promise.all([
          supabase.from('contacts').select('id').eq('tenant_id', tenantId)
            .or([`name.ilike.%${term}%`, digits.length >= 3 ? `phone.ilike.%${digits}%` : null].filter(Boolean).join(',')).limit(100),
          supabase.from('messages').select('conversation_id').eq('tenant_id', tenantId).ilike('content', `%${term}%`)
            .order('created_at', { ascending: false }).limit(100),
        ]);
        const contactIds = (byContact.data || []).map((r) => r.id);
        const convIds = [...new Set((byMessage.data || []).map((r) => r.conversation_id))];
        const parts = [contactIds.length ? `contact_id.in.(${contactIds.join(',')})` : null, convIds.length ? `id.in.(${convIds.join(',')})` : null].filter(Boolean);
        if (!parts.length) return [];
        searchOr = parts.join(',');
      }

      let query = supabase
        .from('conversations')
        .select('id, tenant_id, contact_id, channel_id, inbox_id, status, priority, assigned_to, handoff_mode, ai_enabled, bot_state_json, kanban_column_id, current_ai_agent_id, last_message_at, last_inbound_at, last_outbound_at, last_incoming_message_id, ai_sentiment, integration_id, verification_data, verification_state, lead_capture_state, lead_capture_data, source, created_at, updated_at, contact:contacts(id, tenant_id, phone, name, email, metadata, li_customer_id, created_at, updated_at)')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (searchOr) query = query.or(searchOr);

      if (inboxId) {
        query = query.eq('inbox_id', inboxId);
      } else {
        query = query.not('inbox_id', 'is', null);
      }

      // Tag filter
      if (tagConversationIds) {
        query = query.in('id', tagConversationIds);
      }

      // Assigned agent filter
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      // Date range filter
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const result = (data || []).map((c) => ({
        ...c,
        contact: c.contact || { id: c.contact_id, name: null as string | null, phone: 'Desconhecido', avatar_url: null as string | null },
      })) as unknown as Conversation[];

      // um card por número: o histórico de todos os atendimentos aparece junto na conversa (useConversationTimeline)
      return onePerContact(result);
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  return { conversations, isLoading };
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, content, direction = 'outbound' }: { conversationId: string; content: string; direction?: string }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          conversation_id: conversationId,
          content,
          direction,
          client_message_id: crypto.randomUUID(),
          sender_id: user.id,
          sender_name: user.user_metadata?.full_name || user.email || 'Atendente',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
    },
  });
}
