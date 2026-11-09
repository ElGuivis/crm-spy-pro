import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";

const KEY = "google-ads";

export interface AiProvider {
  id: string;
  label: string;
  is_default: boolean;
  models: Array<{ id: string; label: string }>;
}

export interface AiAdvice {
  text: string;
  provider: string | null;
  model: string | null;
  generatedAt: string | null;
  question: string;
  tokensInput: number | null;
  tokensOutput: number | null;
}

/** IAs já integradas no CRM (credenciais do tenant). O servidor não devolve chave nenhuma. */
export function useGoogleAdsAiProviders(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, "ai-providers"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AiProvider[]> => (await invoke("google-ads-ai", { action: "providers" })).providers ?? [],
  });
}

/** Último parecer da IA (guardado em google_ads_recommendations). */
export function useGoogleAdsAiAdvice(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "ai-advice", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AiAdvice | null> => {
      const { data, error } = await supabase.from("google_ads_recommendations").select("rationale, payload")
        .eq("account_id", accountId!).eq("agent", "strategy_ai").eq("dedupe_key", "ai:advice").maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const p = (data.payload ?? {}) as Record<string, unknown>;
      return {
        text: data.rationale,
        provider: (p.provider as string) ?? null,
        model: (p.model as string) ?? null,
        generatedAt: (p.generated_at as string) ?? null,
        question: (p.question as string) ?? "",
        tokensInput: (p.tokens_input as number) ?? null,
        tokensOutput: (p.tokens_output as number) ?? null,
      };
    },
  });
}

export function useGoogleAdsAiActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const need = () => { if (!accountId) throw new Error("Nenhuma conta cadastrada"); return accountId; };

  const saveAi = useMutation({
    mutationFn: async (v: { enabled: boolean; provider: string | null; model: string | null }) =>
      invoke("google-ads-settings", { action: "set_ai", account_id: need(), ai_enabled: v.enabled, ai_provider: v.provider, ai_model: v.model }),
    onSuccess: (_d, v) => { refresh(); toast.success(v.enabled ? "IA ligada" : "IA desligada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ask = useMutation({
    mutationFn: async (question: string) => invoke("google-ads-ai", { action: "advise", account_id: need(), question: question.trim() || null }),
    onSuccess: () => { refresh(); toast.success("Parecer da IA atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { saveAi, ask };
}
