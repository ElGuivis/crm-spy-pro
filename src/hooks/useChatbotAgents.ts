import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AGENT_SELECT_FIELDS, type ChatbotConfig, useCreateChatbot, useDeleteChatbot } from "./useChatbots";

export function useChatbotAgents() {
  const { tenantId } = useAuth();
  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["chatbot-agents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("ai_agents").select(AGENT_SELECT_FIELDS).eq("tenant_id", tenantId).order("created_at");
      if (error) throw error;
      return (data || []) as unknown as ChatbotConfig[];
    },
    enabled: !!tenantId,
  });
  return { agents, isLoading, refetch };
}

export function useCreateChatbotAgent() {
  return useCreateChatbot();
}

export function useUpdateChatbotAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChatbotConfig>) => {
      const { error } = await supabase.from("ai_agents").update(updates as Record<string, unknown>).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] });
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Configuração atualizada");
    },
  });
}

export function useDeleteChatbotAgent() {
  return useDeleteChatbot();
}

export function useLinkAgentToInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ inboxId, agentId }: { inboxId: string; agentId: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("inboxes") as any).update({ ai_agent_id: agentId }).eq("id", inboxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboxes-full"] });
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      toast.success("Inbox vinculada ao chatbot");
    },
  });
}
