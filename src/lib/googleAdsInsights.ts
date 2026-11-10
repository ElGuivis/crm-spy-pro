/** Formato do relatório de descobertas (google_ads_recommendations, agent data_insights, payload.report). */
export interface InsightFinding { id: string; severity: "high" | "medium" | "low" | "info"; title: string; detail: string }

export interface InsightsReport {
  generated_at: string;
  brand_terms: string[];
  brand: {
    cost: number; revenue: number; roas: number | null; share_of_revenue: number | null; share_of_cost: number | null;
    non_brand_cost: number; non_brand_revenue: number; non_brand_roas: number | null;
  } | null;
  waste: { terms: number; cost: number; top: Array<{ term: string; cost: number; clicks: number }> };
  impression_share: Array<{ campaign: string; share: number | null; lost_budget: number | null; lost_rank: number | null; limit: "budget" | "rank" | "both" | "none" }>;
  devices: Array<{ device: string; cost: number; roas: number | null }>;
  weekdays: Array<{ day: string; cost: number; roas: number | null }>;
  hours: { best: Array<{ hour: number; cost: number; roas: number | null }>; worst: Array<{ hour: number; cost: number; roas: number | null }> };
  regions: Array<{ region: string; cost: number; roas: number | null }>;
  products: { top: Array<{ title: string; revenue: number; cost: number }>; waste: Array<{ title: string; cost: number }> };
  keywords: { waste: Array<{ text: string; cost: number }>; low_quality: Array<{ text: string; score: number; cost: number }> };
  ads: { total: number; weak: number; not_approved: number };
  not_serving: Array<{ campaign: string; reasons: string[] }>;
  findings: InsightFinding[];
}

export const FINDING_LABEL: Record<InsightFinding["severity"], string> = { high: "Importante", medium: "Atenção", low: "Oportunidade", info: "Informação" };
export const FINDING_VARIANT: Record<InsightFinding["severity"], "destructive" | "default" | "secondary" | "outline"> = {
  high: "destructive", medium: "default", low: "secondary", info: "outline",
};

export const LIMIT_LABEL: Record<string, string> = { budget: "Limitada por orçamento", rank: "Limitada por posição (ranking)", both: "Orçamento e ranking", none: "Sem limite relevante" };

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
