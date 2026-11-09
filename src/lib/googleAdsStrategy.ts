/** Formato do relatório do consultor de estratégia (gravado em google_ads_recommendations.payload.report). */
export type Verdict = "running" | "reactivate" | "test_small" | "keep_off" | "insufficient" | "removed";

export interface CampaignAnalysis {
  campaign_id: number;
  name: string;
  channel_type: string | null;
  status: string;
  verdict: Verdict;
  reason: string;
  lifetime: { cost: number; revenue: number; roas: number | null; first: string | null; last: string | null };
  recent: { months: string[]; cost: number; revenue: number; roas: number | null };
  dormant_days: number | null;
  avg_daily_spend_when_active: number | null;
  current_daily_budget: number | null;
}

export interface StrategyReport {
  generated_at: string;
  assumptions: string[];
  min_roas: number;
  min_roas_is_provisional: boolean;
  monthly_cap: number | null;
  daily_target: number | null;
  years: Array<{ year: number; cost: number; revenue: number; roas: number | null }>;
  campaigns: CampaignAnalysis[];
  plan: Array<{ campaign_id: number; name: string; action: "set_budget" | "enable" | "pause"; daily_budget_micros: number | null; why: string }>;
  warnings: string[];
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  running: "Manter ligada",
  reactivate: "Candidata a reativar",
  test_small: "Só teste pequeno",
  keep_off: "Manter desligada",
  insufficient: "Dados insuficientes",
  removed: "Removida",
};

export const VERDICT_VARIANT: Record<Verdict, "default" | "secondary" | "outline" | "destructive"> = {
  running: "default", reactivate: "default", test_small: "secondary", keep_off: "outline", insufficient: "outline", removed: "outline",
};

export const fmtRoas = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
export const fmtMonth = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split("-");
  return `${m}/${y.slice(2)}`;
};
