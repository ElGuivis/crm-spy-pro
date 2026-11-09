/** Auxiliares do módulo Google Ads. O Google devolve dinheiro em "micros" (1 R$ = 1.000.000). */

export const DAYS_PER_MONTH = 30.4;

export const brl = (micros: number | null | undefined): string =>
  micros == null
    ? "—"
    : (micros / 1e6).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const asSeverity = (s: string | null | undefined): Severity =>
  s === "critical" || s === "high" || s === "medium" || s === "low" ? s : "medium";

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ENABLED: "Ativa",
  PAUSED: "Pausada",
  REMOVED: "Removida",
};

export const SERVING_STATUS_LABEL: Record<string, string> = {
  SERVING: "Entregando",
  SUSPENDED: "Suspensa",
  PENDING: "Pendente",
  ENDED: "Encerrada",
  NONE: "—",
};

export const CHANNEL_LABEL: Record<string, string> = {
  SEARCH: "Pesquisa",
  SHOPPING: "Shopping",
  PERFORMANCE_MAX: "Performance Max",
  DISPLAY: "Display",
  VIDEO: "Vídeo",
  SMART: "Inteligente",
  DEMAND_GEN: "Demand Gen",
};

/** Teto mensal guardado em `guardrails.monthly_budget_cap_micros`. */
export function readMonthlyCapMicros(guardrails: unknown): number | null {
  if (guardrails && typeof guardrails === "object" && !Array.isArray(guardrails)) {
    const v = (guardrails as Record<string, unknown>).monthly_budget_cap_micros;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/** Texto do campo de dinheiro (pt-BR) para número. Vazio = sem teto (null). Inválido = NaN. */
export function parseMoneyInput(text: string): number | null {
  const s = text.trim().replace(/^R\$\s*/i, "");
  if (s === "") return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+(,\d{1,2})?$/.test(s)) return Number(s.replace(",", "."));
  return NaN;
}

interface BudgetLike {
  status: string;
  approved_spending_limit_micros: number | null;
  adjusted_spending_limit_micros: number | null;
}

/** Limite de gastos em vigor: aprovado e com o maior limite (mesma regra do diagnóstico no servidor). */
export function activeBudget<T extends BudgetLike>(budgets: T[]): T | null {
  const limit = (b: T) => b.adjusted_spending_limit_micros ?? b.approved_spending_limit_micros ?? 0;
  const ok = budgets.filter((b) => b.status === "APPROVED" && limit(b) > 0);
  return ok.length ? ok.reduce((a, b) => (limit(b) > limit(a) ? b : a)) : null;
}
