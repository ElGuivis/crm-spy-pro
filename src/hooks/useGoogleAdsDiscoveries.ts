import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";
import type { InsightsReport } from "@/lib/googleAdsInsights";

const KEY = "google-ads";

/** Relatório de descobertas (calculado no servidor a partir de todo o histórico detalhado do Google). */
export function useGoogleAdsDiscoveries(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "discoveries", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<InsightsReport | null> => {
      const { data, error } = await supabase.from("google_ads_recommendations").select("payload")
        .eq("account_id", accountId!).eq("agent", "data_insights").eq("dedupe_key", "insights:report").maybeSingle();
      if (error) throw error;
      return ((data?.payload ?? null) as { report?: InsightsReport } | null)?.report ?? null;
    },
  });
}

export type TermOrder = "cost" | "revenue" | "waste";

export function useGoogleAdsTopTerms(accountId: string | undefined, order: TermOrder) {
  return useQuery({
    queryKey: [KEY, "top-terms", accountId, order],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("google_ads_term_top", { p_account: accountId!, p_order: order, p_limit: 50 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Ações da aba Descobertas: atualizar dados do Google, recalcular e editar os termos da marca. */
export function useGoogleAdsDiscoveryActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const need = () => { if (!accountId) throw new Error("Nenhuma conta cadastrada"); return accountId; };

  /** Busca no Google o máximo de dados (3 etapas, para não estourar o tempo) e recalcula as descobertas. */
  const syncAll = useMutation({
    mutationFn: async () => {
      const id = need();
      for (const preset of ["structure", "stats", "static"]) {
        const res = await invoke("google-ads-sync-deep", { account_id: id, preset });
        const bad = res?.results?.[0]?.errors?.[0];
        if (bad) throw new Error(`${bad.dataset}: ${bad.error}`);
      }
      await invoke("google-ads-insights", { account_id: id });
    },
    onSuccess: () => { refresh(); toast.success("Dados do Google atualizados e descobertas recalculadas"); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  const recalc = useMutation({
    mutationFn: async () => invoke("google-ads-insights", { account_id: need() }),
    onSuccess: () => { refresh(); toast.success("Descobertas recalculadas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBrandTerms = useMutation({
    mutationFn: async (terms: string[]) => {
      await invoke("google-ads-settings", { action: "set_brand_terms", account_id: need(), brand_terms: terms });
      return invoke("google-ads-insights", { account_id: need() });
    },
    onSuccess: () => { refresh(); toast.success("Termos da marca salvos e descobertas recalculadas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { syncAll, recalc, saveBrandTerms };
}
