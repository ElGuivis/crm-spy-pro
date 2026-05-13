import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface MenuButton {
  id: string;
  text: string;
  action: "respond" | "order_lookup" | "transfer_human" | "submenu";
  response?: string;
  submenu_buttons?: MenuButton[];
}

export interface KeywordRule {
  id: string;
  keywords: string[];
  action: "respond" | "transfer_column";
  response?: string;
  target_column_id?: string;
}

export interface ChatbotConfig {
  id: string;
  name: string;
  agent_type: "chatbot" | "ai_agent";
  welcome_message: string | null;
  interactive_buttons: MenuButton[] | null;
  keyword_action_rules: KeywordRule[] | null;
  transfer_keywords: string[] | null;
  order_verification_enabled: boolean | null;
  order_verification_mode: string | null;
  order_verification_messages: Record<string, string> | null;
  order_details_template: string | null;
  is_active: boolean;
  system_prompt: string;
  model: string;
  // AI Agent specific
  temperature?: number | null;
  max_tokens?: number | null;
  inactivity_enabled?: boolean | null;
  inactivity_timeout_minutes?: number | null;
  inactivity_message?: string | null;
  message_buffer_enabled?: boolean | null;
  message_buffer_delay_seconds?: number | null;
  description?: string | null;
}

const AGENT_SELECT_FIELDS =
  "id, name, agent_type, welcome_message, interactive_buttons, keyword_action_rules, transfer_keywords, order_verification_enabled, order_verification_mode, order_verification_messages, order_details_template, is_active, system_prompt, model, ai_provider, temperature, max_tokens, inactivity_enabled, inactivity_timeout_minutes, inactivity_message, message_buffer_enabled, message_buffer_delay_seconds, description";

// ── Chatbots (fluxo estruturado) ──────────────────────────────────────────────

export function useChatbots() {
  const { tenantId } = useAuth();

  const { data: chatbots = [], isLoading, refetch } = useQuery({
    queryKey: ["chatbots", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("ai_agents")
        .select(AGENT_SELECT_FIELDS)
        .eq("tenant_id", tenantId)
        .eq("agent_type", "chatbot")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as ChatbotConfig[];
    },
    enabled: !!tenantId,
  });

  return { chatbots, isLoading, refetch };
}

export function useCreateChatbot() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      if (!tenantId) throw new Error("No tenant");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: agent, error } = await (supabase.from("ai_agents") as any)
        .insert({
          tenant_id: tenantId,
          name: data.name,
          agent_type: "chatbot",
          system_prompt: "",
          model: "gpt-4o-mini",
          welcome_message: "Olá! 👋 Como posso ajudar?\n\n1️⃣ Rastrear pedido\n2️⃣ Falar com atendente",
          interactive_buttons: [
            { id: "track", text: "📦 Rastrear pedido", action: "order_lookup" },
            { id: "human", text: "👤 Falar com atendente", action: "transfer_human" },
          ],
          transfer_keywords: ["atendente", "humano", "pessoa"],
          is_active: true,
        } as Record<string, unknown>)
        .select("id")
        .single();
      if (error) throw error;
      return agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] });
      toast.success("Chatbot criado com sucesso");
    },
  });
}

export function useUpdateChatbot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChatbotConfig>) => {
      const { error } = await supabase
        .from("ai_agents")
        .update(updates as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast.success("Chatbot atualizado");
    },
  });
}

export function useDeleteChatbot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] });
      toast.success("Chatbot excluído");
    },
  });
}

// ── Agentes de IA (generativos) ───────────────────────────────────────────────

export function useAIAgents() {
  const { tenantId } = useAuth();

  const { data: aiAgents = [], isLoading, refetch } = useQuery({
    queryKey: ["ai-agents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("ai_agents")
        .select(AGENT_SELECT_FIELDS)
        .eq("tenant_id", tenantId)
        .eq("agent_type", "ai_agent")
        .order("created_at");
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
      const { data: agent, error } = await (supabase.from("ai_agents") as any)
        .insert({
          tenant_id: tenantId,
          name: data.name,
          agent_type: "ai_agent",
          description: data.description || null,
          system_prompt: "Você é um assistente virtual especializado em atendimento ao cliente. Seja sempre prestativo, claro e objetivo nas suas respostas.",
          model: "gpt-4o-mini",
          temperature: 0.7,
          max_tokens: 1024,
          welcome_message: "Olá! 👋 Sou seu assistente virtual. Como posso ajudar?",
          transfer_keywords: ["atendente", "humano", "gerente", "falar com pessoa"],
          is_active: true,
          message_buffer_enabled: true,
          message_buffer_delay_seconds: 5,
          inactivity_enabled: false,
          inactivity_timeout_minutes: 30,
        } as Record<string, unknown>)
        .select("id")
        .single();
      if (error) throw error;
      return agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] });
      toast.success("Agente de IA criado com sucesso");
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChatbotConfig>) => {
      const { error } = await supabase
        .from("ai_agents")
        .update(updates as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente de IA atualizado");
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-agents"] });
      toast.success("Agente de IA excluído");
    },
  });
}

// ── Legacy (mantido para compatibilidade com InboxSettings etc.) ──────────────

export function useChatbotAgents() {
  const { tenantId } = useAuth();

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["chatbot-agents", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("ai_agents")
        .select(AGENT_SELECT_FIELDS)
        .eq("tenant_id", tenantId)
        .order("created_at");
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
      const { error } = await supabase
        .from("ai_agents")
        .update(updates as Record<string, unknown>)
        .eq("id", id);
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
      const { error } = await (supabase.from("inboxes") as any)
        .update({ ai_agent_id: agentId })
        .eq("id", inboxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboxes-full"] });
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      toast.success("Inbox vinculada ao chatbot");
    },
  });
}
