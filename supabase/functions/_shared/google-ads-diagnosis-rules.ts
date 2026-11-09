/**
 * Regras do agente "diagnostico-de-conta" (tipo A: sem IA, sem tokens).
 * Funcoes puras: recebem os dados ja sincronizados e devolvem achados. Quem grava em
 * google_ads_recommendations e o runner. Plano: docs/google-ads-agentes.md (secao 4.1).
 *
 * R1 entrega suspensa por saldo esgotado | R2 saldo acabando | R3 ativa sem impressoes
 * R4 faturamento/conta com problema     | R5 (fase seguinte: anuncios reprovados)
 * R6 dados desatualizados               | R7 orcamentos diarios acima do teto mensal
 */

export type Severity = "critical" | "high" | "medium" | "low";

export interface RuleCampaign {
  campaign_id: number;
  name: string;
  status: string;
  serving_status: string | null;
  daily_budget_micros: number | null;
}
export interface RuleAccountBudget {
  status: string;
  approved_spending_limit_micros: number | null;
  adjusted_spending_limit_micros: number | null;
  amount_served_micros: number;
}
export interface RuleDaily {
  campaign_id: number;
  date: string; // AAAA-MM-DD
  impressions: number;
  cost_micros: number;
}
export interface RuleInput {
  now: Date;
  accountId: string;
  account: {
    customer_status: string | null;
    billing_status: string | null;
    last_synced_at: string | null;
    guardrails: { monthly_budget_cap_micros?: number } | null;
  };
  campaigns: RuleCampaign[];
  accountBudgets: RuleAccountBudget[];
  daily: RuleDaily[];
}
export interface Finding {
  rule: string;
  severity: Severity;
  kind: "alert" | "insight" | "manual_action";
  risk: "low" | "medium" | "high";
  dedupe_key: string;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
}

export const THRESHOLDS = {
  exhaustedRemainingMicros: 1_000_000, // restando <= R$ 1,00 = esgotado (valor absoluto: um % de um limite de 6 digitos esconderia centenas de reais)
  daysCritical: 1,         // saldo para <= 1 dia
  daysHigh: 3,
  daysMedium: 7,
  spendWindowDays: 7,      // janela da media de gasto diario
  noImpressionDays: 7,
  staleHours: 36,
  daysPerMonth: 30.4,
} as const;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const RISK_OF: Record<Severity, Finding["risk"]> = { critical: "high", high: "high", medium: "medium", low: "low" };

export const brl = (micros: number): string =>
  `R$ ${(micros / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (now: Date, n: number) => dayKey(new Date(now.getTime() - n * 86_400_000));

function finding(f: Omit<Finding, "risk"> & { risk?: Finding["risk"] }): Finding {
  return { ...f, risk: f.risk ?? RISK_OF[f.severity] };
}

/** Orcamento da conta em vigor: APPROVED com o maior limite ajustado. null se a conta nao tem esse tipo de orcamento. */
export function activeAccountBudget(budgets: RuleAccountBudget[]): RuleAccountBudget | null {
  const ok = budgets.filter((b) => b.status === "APPROVED" && (b.adjusted_spending_limit_micros ?? b.approved_spending_limit_micros ?? 0) > 0);
  if (!ok.length) return null;
  return ok.reduce((a, b) =>
    (b.adjusted_spending_limit_micros ?? b.approved_spending_limit_micros ?? 0) > (a.adjusted_spending_limit_micros ?? a.approved_spending_limit_micros ?? 0) ? b : a);
}

const limitOf = (b: RuleAccountBudget) => b.adjusted_spending_limit_micros ?? b.approved_spending_limit_micros ?? 0;

/**
 * Media de gasto por dia (micros) nos ultimos N dias COMPLETOS (de hoje-N ate ontem), contando dias sem gasto como
 * zero. Hoje fica de fora: e um dia parcial e puxaria a media para baixo, deixando a previsao otimista demais.
 */
export function avgDailySpend(daily: RuleDaily[], now: Date, windowDays: number = THRESHOLDS.spendWindowDays): number {
  const from = daysAgo(now, windowDays);
  const today = dayKey(now);
  const total = daily.filter((d) => d.date >= from && d.date < today).reduce((s, d) => s + d.cost_micros, 0);
  return total / windowDays;
}

export function runDiagnosis(input: RuleInput): Finding[] {
  const out: Finding[] = [];
  const { accountId, now } = input;
  const enabled = input.campaigns.filter((c) => c.status === "ENABLED");
  const budget = activeAccountBudget(input.accountBudgets);

  // R4: conta ou faturamento com problema
  const { customer_status: cs, billing_status: bs } = input.account;
  if ((cs && cs !== "ENABLED") || (bs && bs !== "APPROVED")) {
    out.push(finding({
      rule: "R4", severity: "critical", kind: "manual_action", dedupe_key: `R4:${accountId}`,
      title: "Conta ou faturamento com problema",
      rationale: `Status da conta: ${cs ?? "desconhecido"}; status do faturamento: ${bs ?? "desconhecido"}. Enquanto isso nao estiver ENABLED/APPROVED, nenhum anuncio e entregue.`,
      payload: { customer_status: cs, billing_status: bs, action: "Abrir Google Ads > Faturamento e resolver a pendencia." },
    }));
  }

  // R1 / R2: saldo (limite de gastos da conta)
  if (budget) {
    const limit = limitOf(budget);
    const served = budget.amount_served_micros;
    const remaining = Math.max(limit - served, 0);
    const exhausted = remaining <= THRESHOLDS.exhaustedRemainingMicros;
    const notServing = enabled.filter((c) => c.serving_status && c.serving_status !== "SERVING");

    if (exhausted) {
      out.push(finding({
        rule: "R1", severity: "critical", kind: "manual_action", dedupe_key: `R1:${accountId}`,
        title: "Saldo da conta esgotado: anuncios nao estao sendo entregues",
        rationale: `O limite de gastos da conta e ${brl(limit)} e o valor ja gasto e ${brl(served)} (${(served / limit * 100).toFixed(2)}%). ` +
          (notServing.length
            ? `${notServing.length} campanha(s) ativa(s) estao com entrega ${[...new Set(notServing.map((c) => c.serving_status))].join("/")}: ${notServing.map((c) => c.name).join("; ")}. `
            : "") +
          "A API nao informa o motivo exato da suspensao (devolve UNKNOWN); a causa e inferida desta igualdade. Confirmar em Google Ads > Faturamento > Resumo.",
        payload: {
          limit_micros: limit, served_micros: served, campaigns: notServing.map((c) => c.campaign_id),
          action: "Repor saldo em Google Ads > Faturamento. Antes, revisar os orcamentos diarios das campanhas ativas (ver alerta R7).",
        },
      }));
    } else {
      const avg = avgDailySpend(input.daily, now);
      if (avg > 0) {
        const days = remaining / avg;
        const severity: Severity | null = days <= THRESHOLDS.daysCritical ? "critical" : days <= THRESHOLDS.daysHigh ? "high" : days <= THRESHOLDS.daysMedium ? "medium" : null;
        if (severity) {
          out.push(finding({
            rule: "R2", severity, kind: "manual_action", dedupe_key: `R2:${accountId}`,
            title: `Saldo deve acabar em cerca de ${days < 1 ? "menos de 1 dia" : `${days.toFixed(1)} dias`}`,
            rationale: `Restam ${brl(remaining)} de ${brl(limit)} e a media de gasto dos ultimos ${THRESHOLDS.spendWindowDays} dias e ${brl(avg)}/dia. Previsao simples (media), sem considerar variacao de dias.`,
            payload: { remaining_micros: remaining, avg_daily_micros: avg, days_left: Number(days.toFixed(2)), action: "Repor saldo antes do fim." },
          }));
        }
      }
    }
  }

  // R3: ativa, com orcamento e entrega normal, mas sem nenhuma impressao na janela
  const since3 = daysAgo(now, THRESHOLDS.noImpressionDays);
  for (const c of enabled) {
    if (c.serving_status !== "SERVING" || !(c.daily_budget_micros && c.daily_budget_micros > 0)) continue;
    const imp = input.daily.filter((d) => d.campaign_id === c.campaign_id && d.date >= since3).reduce((s, d) => s + d.impressions, 0);
    if (imp === 0) {
      out.push(finding({
        rule: "R3", severity: "medium", kind: "alert", dedupe_key: `R3:${accountId}:${c.campaign_id}`,
        title: `Campanha ativa sem impressoes: ${c.name}`,
        rationale: `A campanha esta ativa, com entrega normal e orcamento de ${brl(c.daily_budget_micros)}/dia, mas teve 0 impressoes nos ultimos ${THRESHOLDS.noImpressionDays} dias. Verificar anuncios, segmentacao, lances e aprovacao.`,
        payload: { campaign_id: c.campaign_id, daily_budget_micros: c.daily_budget_micros },
      }));
    }
  }

  // R7: soma dos orcamentos diarios x teto mensal definido pelo usuario
  const cap = input.account.guardrails?.monthly_budget_cap_micros;
  if (cap && cap > 0) {
    const dailySum = enabled.reduce((s, c) => s + (c.daily_budget_micros ?? 0), 0);
    const projected = dailySum * THRESHOLDS.daysPerMonth;
    if (projected > cap) {
      out.push(finding({
        rule: "R7", severity: "high", kind: "manual_action", dedupe_key: `R7:${accountId}`,
        title: "Orcamentos diarios das campanhas ativas ultrapassam o teto mensal",
        rationale: `Soma dos orcamentos diarios das ${enabled.length} campanha(s) ativa(s): ${brl(dailySum)}/dia (~${brl(projected)} em ${THRESHOLDS.daysPerMonth} dias), contra um teto mensal de ${brl(cap)}. O Google pode gastar ate o dobro do orcamento diario em um dia, entao a verba pode acabar em poucos dias.`,
        payload: { daily_sum_micros: dailySum, projected_monthly_micros: Math.round(projected), cap_micros: cap, action: "Reduzir os orcamentos diarios ou pausar campanhas antes de repor saldo." },
      }));
    }
  }

  // R6: dado velho (avisa antes de qualquer conclusao)
  const synced = input.account.last_synced_at ? new Date(input.account.last_synced_at).getTime() : 0;
  if (!synced || now.getTime() - synced > THRESHOLDS.staleHours * 3_600_000) {
    out.push(finding({
      rule: "R6", severity: "low", kind: "alert", dedupe_key: `R6:${accountId}`,
      title: "Dados do Google Ads desatualizados",
      rationale: `A ultima sincronizacao foi ${input.account.last_synced_at ?? "nunca"}. Os alertas abaixo podem estar defasados.`,
      payload: { last_synced_at: input.account.last_synced_at },
    }));
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
