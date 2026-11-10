import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";
import { brtDateAfter } from "@/lib/brt";

export type GoogleAdsAccount = Tables<"google_ads_accounts">;
export type GoogleAdsCampaign = Tables<"google_ads_campaigns">;
export type GoogleAdsAccountBudget = Tables<"google_ads_account_budget">;
export type GoogleAdsRecommendation = Tables<"google_ads_recommendations">;

export interface CampaignSpend {
  cost_micros: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversions_value: number;
}

const SPEND_WINDOW_DAYS = 30;
const KEY = "google-ads";

/** Conta do Google Ads do tenant (por enquanto, a primeira cadastrada). */
export function useGoogleAdsAccount() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [KEY, "account", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<GoogleAdsAccount | null> => {
      const { data, error } = await supabase
        .from("google_ads_accounts").select("*").eq("tenant_id", tenantId!).order("created_at").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** Limite de gastos da conta, campanhas, gasto dos últimos 30 dias e alertas pendentes. */
export function useGoogleAdsData(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "data", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const since = brtDateAfter(-SPEND_WINDOW_DAYS);
      const [budget, campaigns, daily, recs] = await Promise.all([
        supabase.from("google_ads_account_budget").select("*").eq("account_id", accountId!),
        supabase.from("google_ads_campaigns").select("*").eq("account_id", accountId!),
        supabase.from("google_ads_campaign_daily")
          .select("campaign_id, impressions, clicks, cost_micros, conversions, conversions_value")
          .eq("account_id", accountId!).gte("date", since),
        supabase.from("google_ads_recommendations").select("*")
          .eq("account_id", accountId!).eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      for (const r of [budget, campaigns, daily, recs]) if (r.error) throw r.error;

      const spend = new Map<number, CampaignSpend>();
      for (const d of daily.data ?? []) {
        const s = spend.get(d.campaign_id) ?? { cost_micros: 0, clicks: 0, impressions: 0, conversions: 0, conversions_value: 0 };
        s.cost_micros += d.cost_micros; s.clicks += d.clicks; s.impressions += d.impressions;
        s.conversions += Number(d.conversions); s.conversions_value += Number(d.conversions_value);
        spend.set(d.campaign_id, s);
      }
      return {
        budgets: (budget.data ?? []) as GoogleAdsAccountBudget[],
        campaigns: (campaigns.data ?? []) as GoogleAdsCampaign[],
        spend,
        alerts: (recs.data ?? []) as GoogleAdsRecommendation[],
      };
    },
  });
}

export function useGoogleAdsActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });

  /** Sincroniza com o Google Ads e roda o diagnóstico em seguida. */
  const syncNow = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Nenhuma conta cadastrada");
      const sync = await invoke("google-ads-sync", { account_id: accountId, days: 30 });
      if (sync?.results?.some((r: { ok: boolean }) => !r.ok)) throw new Error(sync.results[0].error ?? "Falha ao sincronizar");
      await invoke("google-ads-diagnose", { account_id: accountId });
    },
    onSuccess: () => { refresh(); toast.success("Dados atualizados e diagnóstico refeito"); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Define o teto mensal em reais (null remove). Só administradores; o servidor revalida. */
  const saveMonthlyCap = useMutation({
    mutationFn: async (capBrl: number | null) => {
      if (!accountId) throw new Error("Nenhuma conta cadastrada");
      return invoke("google-ads-settings", { action: "set_monthly_cap", account_id: accountId, monthly_cap_brl: capBrl });
    },
    onSuccess: (_d, capBrl) => { refresh(); toast.success(capBrl === null ? "Teto mensal removido" : "Teto mensal salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { syncNow, saveMonthlyCap };
}
