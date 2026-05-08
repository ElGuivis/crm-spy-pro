import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  created_at: string;
}

export function useTags() {
  const { tenantId } = useAuth();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('tags')
        .select('id, tenant_id, name, color, created_at')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as Tag[];
    },
    enabled: !!tenantId,
  });

  return { tags, isLoading };
}

export function useConversationTags(conversationId: string | null) {
  const { data: tagIds = [], isLoading, refetch } = useQuery({
    queryKey: ['conversation-tags', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('conversation_tags')
        .select('tag_id')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return (data || []).map((r) => r.tag_id);
    },
    enabled: !!conversationId,
  });

  return { tagIds, isLoading, refetch };
}

export function useToggleConversationTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, tagId, add }: { conversationId: string; tagId: string; add: boolean }) => {
      if (add) {
        const { error } = await supabase
          .from('conversation_tags')
          .insert({ conversation_id: conversationId, tag_id: tagId });
        if (error && !error.message.includes('duplicate')) throw error;
      } else {
        const { error } = await supabase
          .from('conversation_tags')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('tag_id', tagId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-tags', vars.conversationId] });
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('tags')
        .insert({ tenant_id: tenantId, name, color })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
