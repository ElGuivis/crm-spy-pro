import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface QuickReply {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  is_favorite: boolean;
  usage_count: number;
}

export function useQuickReplies() {
  const { tenantId } = useAuth();

  const { data: quickReplies = [], isLoading } = useQuery({
    queryKey: ['quick-replies', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('quick_replies')
        .select('id, tenant_id, title, content, shortcut, category, is_favorite, usage_count')
        .eq('tenant_id', tenantId)
        .order('is_favorite', { ascending: false })
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as QuickReply[];
    },
    enabled: !!tenantId,
  });

  return { quickReplies, isLoading };
}

export async function incrementQuickReplyUsage(id: string) {
  await supabase
    .from('quick_replies')
    .update({ usage_count: 1 })
    .eq('id', id);
}
