import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";
import type { Suggestion } from "@/lib/googleAdsImplement";

const KEY = "google-ads";
const MAX_IDS = 10;

/** Todas as propostas pendentes (plano de orcamento, construcao, metas de conversao) de uma conta. */
export function useGoogleAdsSuggestions(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "suggestions", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await supabase.from("google_ads_recommendations").select("id, kind, agent, status, title, rationale, error, payload")
        .eq("account_id", accountId!).in("agent", ["strategy_consultant", "build_agent"]).in("status", ["pending", "failed"])
        .not("kind", "in", "(strategy_report,insights_report,ai_advice)").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Suggestion[];
    },
  });
}

export interface Implementer {
  canApply: boolean;
  blockedReason: string | null;
  suggestions: Suggestion[];
  implement: ReturnType<typeof useImplementActions>["implement"];
  quick: ReturnType<typeof useImplementActions>["quick"];
}

/** Implementa propostas (varias de uma vez, na ordem segura) ou age direto numa campanha. O servidor revalida e confere tudo. */
export function useImplementActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const need = () => { if (!accountId) throw new Error("Nenhuma conta cadastrada"); return accountId; };

  const implement = useMutation({
    mutationFn: async (ids: string[]) => {
      const id = need();
      let done = 0;
      for (let i = 0; i < ids.length; i += MAX_IDS) {
        const res = await invoke("google-ads-apply", { action: "apply", account_id: id, recommendation_ids: ids.slice(i, i + MAX_IDS) });
        const bad = (res?.results ?? []).find((r: { ok: boolean }) => !r.ok);
        if (bad) throw new Error(bad.error ?? "Falha ao implementar");
        done += res?.results?.length ?? 0;
      }
      return done;
    },
    onSuccess: (n) => { refresh(); toast.success(`${n} mudança(s) implementada(s) no Google Ads e conferida(s)`); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  const quick = useMutation({
    mutationFn: async (v: { campaignId: number; op: "pause" | "enable" | "set_budget"; dailyBudgetBrl?: number }) => {
      const res = await invoke("google-ads-apply", { action: "quick", account_id: need(), campaign_id: v.campaignId, op: v.op, daily_budget_brl: v.dailyBudgetBrl });
      const bad = (res?.results ?? []).find((r: { ok: boolean }) => !r.ok);
      if (bad) throw new Error(bad.error ?? "Falha ao implementar");
      return res;
    },
    onSuccess: () => { refresh(); toast.success("Mudança feita no Google Ads e conferida"); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  return { implement, quick };
}
