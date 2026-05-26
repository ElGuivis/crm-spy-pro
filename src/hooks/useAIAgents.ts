import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AGENT_SELECT_FIELDS, type ChatbotConfig } from "./useChatbots";

export function useAIAgents() {
  const { tenantId } = useAuth();
  const { data: aiAgents = [], isLoading, refetch } = useQuery({
    queryKey: ["ai-agents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("ai_agents").select(AGENT_SELECT_FIELDS).eq("tenant_id", tenantId).eq("agent_type", "ai_agent").order("created_at");
      if (error) throw error;
      return (data || []) as unknown as ChatbotConfig[];
    },
    enabled: !!tenantId,
  });
  return { aiAgents, isLoading, refetch };
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      if (!tenantId) throw new Error("No tenant");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: agent, error } = await (supabase.from("ai_agents") as any).insert({ tenant_id: tenantId, name: data.name, agent_type: "ai_agent", description: data.description || null, system_prompt: "Você é um assistente virtual especializado em atendimento ao cliente. Seja sempre prestativo, claro e objetivo nas suas respostas.", model: "gpt-4o-mini", temperature: 0.7, max_tokens: 1024, welcome_message: "Olá! 👋 Sou seu assistente virtual. Como posso ajudar?", transfer_keywords: ["atendente", "humano", "gerente", "falar com pessoa"], is_active: true, message_buffer_enabled: true, message_buffer_delay_seconds: 5, inactivity_enabled: false, inactivity_timeout_minutes: 30 } as Record<string, unknown>).select("id").single();
      if (error) throw error;
      return agent;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-agents"] }); queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] }); toast.success("Agente de IA criado com sucesso"); },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChatbotConfig>) => {
      const { error } = await supabase.from("ai_agents").update(updates as Record<string, unknown>).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-agents"] }); toast.success("Agente de IA atualizado"); },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ai-agents"] }); queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] }); toast.success("Agente de IA excluído"); },
  });
}
