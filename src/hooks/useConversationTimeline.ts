import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Conversation, Message } from "./useAtendimentos";

/** Um atendimento (linha de `conversations`) dentro do histórico do número. */
export interface TimelineSession {
  id: string;
  status: string;
  source: string;
  created_at: string;
  closed_at: string | null;
}

interface TimelineData { messages: Message[]; sessions: TimelineSession[] }

const MESSAGE_COLUMNS = 'id, conversation_id, content, content_type, sender_type, direction, type, status, media_url, provider_message_id, error_json, created_at';
const LIMIT = 300;

/**
 * Histórico completo do número: mensagens de TODOS os atendimentos do contato numa linha do tempo só.
 * Os atendimentos continuam separados no banco (avaliação, tempo de resposta e relatórios por atendimento);
 * aqui só a leitura é unificada. Realtime acompanha o atendimento atual.
 */
export function useConversationTimeline(conversationId: string | null, contactId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['atendimentos-messages', conversationId, contactId ?? null], [conversationId, contactId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<TimelineData> => {
      if (!conversationId) return { messages: [], sessions: [] };
      let sessions: TimelineSession[] = [];
      if (contactId) {
        const { data: convs, error } = await supabase.from('conversations')
          .select('id, status, source, created_at, closed_at')
          .eq('contact_id', contactId).order('created_at', { ascending: true });
        if (error) throw error;
        sessions = (convs || []) as TimelineSession[];
      }
      const ids = sessions.map((s) => s.id);
      if (!ids.includes(conversationId)) ids.push(conversationId);
      const { data: msgs, error } = await supabase.from('messages')
        .select(MESSAGE_COLUMNS).in('conversation_id', ids)
        .order('created_at', { ascending: false }).limit(LIMIT);
      if (error) throw error;
      // as mais recentes, na ordem de leitura
      return { messages: ((msgs || []) as unknown as Message[]).reverse(), sessions };
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    if (!conversationId) return;
    const patch = (fn: (prev: Message[]) => Message[]) =>
      queryClient.setQueryData<TimelineData>(queryKey, (prev) => prev ? { ...prev, messages: fn(prev.messages) } : prev);

    const channel = supabase
      .channel(`atendimentos-msg-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as unknown as Message;
          patch((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as unknown as Message;
          patch((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        })
      .subscribe((status) => {
        // Ao (re)conectar, busca de novo: mensagem que chegou com a conexão caída não aparecia até trocar de conversa.
        if (status === 'SUBSCRIBED') queryClient.invalidateQueries({ queryKey });
      });

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryKey, queryClient]);

  return { messages: data?.messages ?? [], sessions: data?.sessions ?? [], isLoading, refetch };
}

/**
 * Um card por número na lista: entre os atendimentos do mesmo contato fica o que ainda está em andamento
 * (o mais recente), senão o último encerrado. A lista chega ordenada pela última mensagem.
 */
export function onePerContact(conversations: Conversation[]): Conversation[] {
  const best = new Map<string, Conversation>();
  for (const c of conversations) {
    const cur = best.get(c.contact_id);
    if (!cur || (cur.status === 'closed' && c.status !== 'closed')) best.set(c.contact_id, c);
  }
  const keep = new Set(Array.from(best.values(), (c) => c.id));
  return conversations.filter((c) => keep.has(c.id));
}
