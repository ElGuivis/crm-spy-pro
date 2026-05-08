import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type EventType = 'assigned' | 'transferred' | 'closed' | 'reopened' | 'handoff_on' | 'handoff_off' | 'blocked' | 'bot_paused' | 'bot_resumed';

async function logEvent(
  tenantId: string,
  conversationId: string,
  type: EventType,
  actorUserId: string,
  payload?: Record<string, unknown>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('conversation_events' as any) as any).insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    type,
    actor_user_id: actorUserId,
    payload_json: payload || {},
  });
}

/** Helper to insert a system message into a conversation */
async function insertSystemMessage(tenantId: string, conversationId: string, content: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('messages') as any).insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    sender_type: 'system',
    content,
    content_type: 'text',
    status: 'sent',
    direction: 'system',
    type: 'text',
  });
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useToggleBot() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, currentlyEnabled }: { conversationId: string; currentlyEnabled: boolean }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');

      const newValue = !currentlyEnabled;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('conversations') as any)
        .update({
          ai_enabled: newValue,
          handoff_mode: !newValue,
          status: newValue ? 'bot' : 'open',
        })
        .eq('id', conversationId);
      if (error) throw error;

      await logEvent(tenantId, conversationId, newValue ? 'bot_resumed' : 'bot_paused', user.id);
      await insertSystemMessage(tenantId, conversationId, newValue ? '🤖 Bot reativado' : '🛑 Bot pausado — atendimento humano');

      return newValue;
    },
    onSuccess: (newValue) => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
      toast.success(newValue ? 'Bot reativado' : 'Bot pausado');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useAssignConversation() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, assignTo }: { conversationId: string; assignTo?: string }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');
      const target = assignTo || user.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('conversations') as any)
        .update({
          assigned_to: target,
          status: 'open',
          handoff_mode: true,
          ai_enabled: false,
        })
        .eq('id', conversationId);
      if (error) throw error;

      await logEvent(tenantId, conversationId, 'assigned', user.id, { assigned_to: target });
      await insertSystemMessage(tenantId, conversationId, '👤 Conversa assumida por atendente');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
      toast.success('Conversa assumida');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useCloseConversation() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('conversations') as any)
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          ai_enabled: false,
        })
        .eq('id', conversationId);
      if (error) throw error;

      await logEvent(tenantId, conversationId, 'closed', user.id);
      await insertSystemMessage(tenantId, conversationId, '✅ Conversa encerrada');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
      toast.success('Conversa encerrada');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useReopenConversation() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('conversations') as any)
        .update({
          status: 'open',
          closed_at: null,
        })
        .eq('id', conversationId);
      if (error) throw error;

      await logEvent(tenantId, conversationId, 'reopened', user.id);
      await insertSystemMessage(tenantId, conversationId, '🔄 Conversa reaberta');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
      toast.success('Conversa reaberta');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useBlockContact() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, phone }: { conversationId: string; phone: string }) => {
      if (!tenantId || !user) throw new Error('Not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('contact_blocks' as any) as any).upsert({
        tenant_id: tenantId,
        phone_e164: phone,
        reason: 'Bloqueado pelo atendente',
      }, { onConflict: 'tenant_id,phone_e164' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('conversations') as any)
        .update({ status: 'closed', ai_enabled: false })
        .eq('id', conversationId);

      await logEvent(tenantId, conversationId, 'blocked', user.id, { phone });
      await insertSystemMessage(tenantId, conversationId, '🚫 Contato bloqueado');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos-conversations'] });
      toast.success('Contato bloqueado');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
