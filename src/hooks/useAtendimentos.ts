import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import type { Json } from "@/integrations/supabase/types";

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

export function useConversations(inboxId: string | null, filters?: ConversationFilters) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

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

      let query = supabase
        .from('conversations')
        .select('id, tenant_id, contact_id, channel_id, inbox_id, status, priority, assigned_to, handoff_mode, ai_enabled, bot_state_json, kanban_column_id, current_ai_agent_id, last_message_at, last_inbound_at, last_outbound_at, last_incoming_message_id, integration_id, verification_data, verification_state, lead_capture_state, lead_capture_data, source, created_at, updated_at, contact:contacts(id, tenant_id, phone, name, email, metadata, li_customer_id, created_at, updated_at)')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);

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
      
      let result = (data || []).map((c: any) => ({
        ...c,
        contact: c.contact || { id: c.contact_id, name: null, phone: 'Desconhecido', avatar_url: null },
      })) as Conversation[];

      // Client-side search (name, phone, preview)
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(c => {
          const name = c.contact?.name?.toLowerCase() || '';
          const phone = c.contact?.phone?.toLowerCase() || '';
          const preview = (c.last_message_preview || '').toLowerCase();
          return name.includes(q) || phone.includes(q) || preview.includes(q);
        });
      }

      return result;
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`atendimentos-conv-${tenantId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations', tenantId] }); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);

  return { conversations, isLoading };
}

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ['atendimentos-messages', conversationId];

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, content, content_type, sender_type, direction, type, status, media_url, provider_message_id, error_json, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as Message[];
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  // Realtime for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`atendimentos-msg-${conversationId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as unknown as Message;
          queryClient.setQueryData<Message[]>(queryKey, (prev = []) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as unknown as Message;
          queryClient.setQueryData<Message[]>(queryKey, (prev = []) =>
            prev.map(m => m.id === updated.id ? updated : m)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, isLoading, refetch };
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
