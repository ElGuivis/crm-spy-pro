import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { StrategyReport } from "@/lib/googleAdsStrategy";

export type MonthlyRow = Tables<"google_ads_account_monthly">;
export type LifetimeRow = Tables<"google_ads_campaign_lifetime">;
export type ConversionActionRow = Tables<"google_ads_conversion_actions">;
export type ConversionLifetimeRow = Tables<"google_ads_conversion_lifetime">;
export type AuditRow = Tables<"google_ads_audit_log">;
export type RecommendationRow = Tables<"google_ads_recommendations">;

const KEY = "google-ads";
const ACTION_KINDS = ["adjust_budget", "enable_campaign", "pause_campaign"];

/** Histórico completo (desde o início da conta): conta por mês, vida de cada campanha e conversões por ação. */
export function useGoogleAdsHistory(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "history", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const [monthly, lifetime, actions, convLife] = await Promise.all([
        supabase.from("google_ads_account_monthly").select("*").eq("account_id", accountId!).order("month"),
        supabase.from("google_ads_campaign_lifetime").select("*").eq("account_id", accountId!),
        supabase.from("google_ads_conversion_actions").select("*").eq("account_id", accountId!),
        supabase.from("google_ads_conversion_lifetime").select("*").eq("account_id", accountId!).order("conversions", { ascending: false }),
      ]);
      for (const r of [monthly, lifetime, actions, convLife]) if (r.error) throw r.error;
      return {
        monthly: (monthly.data ?? []) as MonthlyRow[],
        lifetime: new Map((lifetime.data ?? []).map((l) => [Number(l.campaign_id), l as LifetimeRow])),
        actions: (actions.data ?? []) as ConversionActionRow[],
        conversions: (convLife.data ?? []) as ConversionLifetimeRow[],
      };
    },
  });
}

/** Relatório do consultor de estratégia + linhas do plano pendentes de decisão. */
export function useGoogleAdsStrategy(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "strategy", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.from("google_ads_recommendations").select("*")
        .eq("account_id", accountId!).eq("agent", "strategy_consultant").in("status", ["pending", "failed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as RecommendationRow[];
      const reportRow = rows.find((r) => r.kind === "strategy_report");
      const report = ((reportRow?.payload ?? null) as { report?: StrategyReport } | null)?.report ?? null;
      return { report, plan: rows.filter((r) => ACTION_KINDS.includes(r.kind)) };
    },
  });
}

/** Últimas ações registradas (aplicações no Google Ads, desfazer e mudanças de regras). */
export function useGoogleAdsActivity(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "activity", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.from("google_ads_audit_log").select("*")
        .eq("account_id", accountId!).in("action", ["apply", "revert", "guardrails_change", "mode_change"])
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
}
