import { useState, useEffect } from "react";
import { type ChatbotConfig } from "@/hooks/useChatbotBuilder";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

export const PROVIDER_MODELS: Record<string, { value: string; label: string; desc: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o", desc: "Máxima precisão · Multimodal" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Rápido e eficiente · Custo baixo" },
  ],
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Rápido · Multimodal" },
    { value: "gemini-2.0-pro", label: "Gemini 2.0 Pro", desc: "Alta capacidade · Contexto longo" },
  ],
  groq: [
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B", desc: "Potente · Versátil" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", desc: "Ultra-rápido · Leve" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B", desc: "Balanceado · Contexto longo" },
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small", desc: "Rápido · Eficiente" },
    { value: "mistral-large-latest", label: "Mistral Large", desc: "Alta capacidade · Preciso" },
  ],
};

export const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI", google: "Google", groq: "Groq", mistral: "Mistral",
};

export function useAICredentials() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["tenant-ai-credentials", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.functions.invoke("manage-credentials", { body: { action: "list" } });
      if (error) throw error;
      return data?.credentials || [];
    },
    enabled: !!tenantId,
  });
}

export function useAIAgentEditor(
  agent: ChatbotConfig,
  onUpdate: (data: { id: string } & Partial<ChatbotConfig>) => Promise<void>
) {
  const { data: credentials = [], isLoading: credentialsLoading } = useAICredentials();
  const availableProviders = credentials.map((c) => c.provider).filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i);
  const hasAIProvider = availableProviders.length > 0;
  const defaultProvider = credentials.find((c) => (c as any).is_default)?.provider;

  const [name, setName] = useState(agent.name);
  const [isActive, setIsActive] = useState(agent.is_active);
  const [aiProvider, setAiProvider] = useState<string>((agent as any).ai_provider || "");
  const [model, setModel] = useState(agent.model || "");
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");
  const [temperature, setTemperature] = useState<number>((agent as any).temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState<number>((agent as any).max_tokens ?? 1024);
  const [welcomeMsg, setWelcomeMsg] = useState(agent.welcome_message || "");
  const [inactivityEnabled, setInactivityEnabled] = useState((agent as any).inactivity_enabled ?? false);
  const [inactivityTimeout, setInactivityTimeout] = useState<number>((agent as any).inactivity_timeout_minutes ?? 30);
  const [inactivityMessage, setInactivityMessage] = useState((agent as any).inactivity_message || "");
  const [bufferEnabled, setBufferEnabled] = useState((agent as any).message_buffer_enabled ?? false);
  const [bufferDelay, setBufferDelay] = useState<number>((agent as any).message_buffer_delay_seconds ?? 5);
  const [transferKw, setTransferKw] = useState((agent.transfer_keywords || []).join(", "));
  const [orderEnabled, setOrderEnabled] = useState(agent.order_verification_enabled || false);
  const [orderMode, setOrderMode] = useState(agent.order_verification_mode || "cpf");
  const [orderTemplate, setOrderTemplate] = useState(agent.order_details_template || "");

  useEffect(() => {
    if (aiProvider && PROVIDER_MODELS[aiProvider]) {
      const models = PROVIDER_MODELS[aiProvider];
      if (!models.some((m) => m.value === model)) setModel(models[0].value);
    }
  }, [aiProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aiProvider && availableProviders.length > 0) {
      setAiProvider(defaultProvider || availableProviders[0]);
    }
  }, [availableProviders, aiProvider, defaultProvider]);

  const handleSave = async () => {
    await onUpdate({
      id: agent.id, name, is_active: isActive, model, system_prompt: systemPrompt,
      welcome_message: welcomeMsg,
      transfer_keywords: transferKw.split(",").map((s) => s.trim()).filter(Boolean),
      order_verification_enabled: orderEnabled, order_verification_mode: orderMode,
      order_details_template: orderTemplate, temperature, max_tokens: maxTokens,
      inactivity_enabled: inactivityEnabled, inactivity_timeout_minutes: inactivityTimeout,
      inactivity_message: inactivityMessage, message_buffer_enabled: bufferEnabled,
      message_buffer_delay_seconds: bufferDelay, ai_provider: aiProvider || null,
    } as any);
  };

  const currentModels = aiProvider && PROVIDER_MODELS[aiProvider] ? PROVIDER_MODELS[aiProvider] : [];

  return {
    credentialsLoading, availableProviders, hasAIProvider,
    name, setName, isActive, setIsActive,
    aiProvider, setAiProvider, model, setModel, currentModels,
    systemPrompt, setSystemPrompt, temperature, setTemperature, maxTokens, setMaxTokens,
    welcomeMsg, setWelcomeMsg,
    inactivityEnabled, setInactivityEnabled, inactivityTimeout, setInactivityTimeout,
    inactivityMessage, setInactivityMessage,
    bufferEnabled, setBufferEnabled, bufferDelay, setBufferDelay,
    transferKw, setTransferKw,
    orderEnabled, setOrderEnabled, orderMode, setOrderMode, orderTemplate, setOrderTemplate,
    handleSave,
  };
}
