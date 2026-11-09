/**
 * Runner do agente "consultor-de-estrategia": le historico ja sincronizado, roda as regras e mantem
 * o relatorio + as linhas do plano em google_ads_recommendations (sem duplicar; respeita decisoes do usuario).
 * Nada aqui escreve no Google Ads.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildStrategy, type PlanLine, type StrategyReport } from "./google-ads-strategy-rules.ts";

export const STRATEGY_AGENT = "strategy_consultant";
const REPORT_KEY = "strategy:report";

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
};

export interface StrategyRunResult {
  account_id: string;
  ok: boolean;
  plan_lines?: number;
  report?: StrategyReport;
  error?: string;
}

const planKind = (a: PlanLine["action"]) => a === "pause" ? "pause_campaign" : a === "enable" ? "enable_campaign" : "adjust_budget";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function runStrategy(supabase: SupabaseClient, accountId: string, actor: string, now = new Date()): Promise<StrategyRunResult> {
  try {
    const account = must(await supabase.from("google_ads_accounts").select("id, tenant_id, guardrails").eq("id", accountId).limit(1), "conta")[0] as
      { id: string; tenant_id: string; guardrails: Record<string, unknown> | null } | undefined;
    if (!account) throw new Error("conta nao encontrada");
    const g = account.guardrails ?? {};

    const [campaigns, lifetime, monthly, actions, existing] = await Promise.all([
      supabase.from("google_ads_campaigns").select("campaign_id, name, status, channel_type, daily_budget_micros").eq("account_id", accountId),
      supabase.from("google_ads_campaign_lifetime").select("campaign_id, cost_micros, conversions_value, first_spend_date, last_spend_date").eq("account_id", accountId),
      supabase.from("google_ads_campaign_monthly").select("campaign_id, month, cost_micros, conversions_value, days_with_spend").eq("account_id", accountId).limit(5000),
      supabase.from("google_ads_conversion_actions").select("name, status, category, primary_for_goal, include_in_conversions_metric").eq("account_id", accountId),
      supabase.from("google_ads_recommendations").select("id, dedupe_key, status").eq("account_id", accountId).eq("agent", STRATEGY_AGENT).not("dedupe_key", "is", null),
    ]);

    const report = buildStrategy({
      now,
      monthlyCapMicros: typeof g.monthly_budget_cap_micros === "number" ? g.monthly_budget_cap_micros : null,
      minRoas: typeof g.min_roas === "number" ? g.min_roas : null,
      campaigns: must(campaigns, "campanhas") as never,
      lifetime: must(lifetime, "historico") as never,
      monthly: must(monthly, "meses") as never,
      conversionActions: must(actions, "conversoes") as never,
    });

    const prev = new Map((must(existing, "recomendacoes") as Array<{ id: string; dedupe_key: string; status: string }>).map((r) => [r.dedupe_key, r]));
    const rows: Array<{ key: string; fields: Record<string, unknown> }> = [{
      key: REPORT_KEY,
      fields: {
        kind: "strategy_report", severity: "medium", risk: "low",
        title: "Analise estrategica da conta (historico completo)",
        rationale: summarize(report), payload: { report: compact(report) },
      },
    }];
    for (const p of report.plan) {
      rows.push({
        key: `plan:${p.campaign_id}`,
        fields: {
          kind: planKind(p.action), severity: p.action === "pause" ? "high" : "medium", risk: p.action === "set_budget" ? "low" : "medium",
          title: planTitle(p), rationale: p.why,
          payload: { campaign_id: p.campaign_id, action: p.action, daily_budget_micros: p.daily_budget_micros },
        },
      });
    }

    for (const r of rows) {
      const old = prev.get(r.key);
      if (!old) {
        const { error } = await supabase.from("google_ads_recommendations").insert({
          tenant_id: account.tenant_id, account_id: accountId, agent: STRATEGY_AGENT, dedupe_key: r.key, status: "pending", ...r.fields,
        });
        if (error) throw new Error(`criar recomendacao: ${error.message}`);
      } else if (old.status === "pending" || old.status === "expired") {
        const { error } = await supabase.from("google_ads_recommendations")
          .update({ ...r.fields, status: "pending", decided_at: null, decided_by: null }).eq("id", old.id);
        if (error) throw new Error(`atualizar recomendacao: ${error.message}`);
      } else if (r.key !== REPORT_KEY && old.status !== "rejected") {
        // Ja aplicada/aprovada/falhou: se o plano continua pedindo, reabre para nova decisao.
        const { error } = await supabase.from("google_ads_recommendations")
          .update({ ...r.fields, status: "pending", decided_at: null, decided_by: null, applied_at: null, error: null }).eq("id", old.id);
        if (error) throw new Error(`reabrir recomendacao: ${error.message}`);
      }
    }
    const live = new Set(rows.map((r) => r.key));
    for (const old of prev.values()) {
      if (old.status === "pending" && !live.has(old.dedupe_key)) {
        await supabase.from("google_ads_recommendations").update({ status: "expired" }).eq("id", old.id);
      }
    }

    await supabase.from("google_ads_audit_log").insert({
      tenant_id: account.tenant_id, account_id: accountId, actor, action: "strategy",
      after_state: { plan_lines: report.plan.length, min_roas: report.min_roas, provisional: report.min_roas_is_provisional },
    });
    return { account_id: accountId, ok: true, plan_lines: report.plan.length, report };
  } catch (err) {
    return { account_id: accountId, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}

function planTitle(p: PlanLine): string {
  if (p.action === "pause") return `Pausar "${p.name}"`;
  if (p.action === "enable") return `Reativar "${p.name}" com ${money((p.daily_budget_micros ?? 0) / 1e6)}/dia`;
  return `Ajustar "${p.name}" para ${money((p.daily_budget_micros ?? 0) / 1e6)}/dia`;
}

function summarize(r: StrategyReport): string {
  const best = r.campaigns.filter((c) => c.verdict === "running" || c.verdict === "reactivate").slice(0, 3).map((c) => c.name);
  return [
    `ROAS minimo usado: ${r.min_roas}x${r.min_roas_is_provisional ? " (provisorio)" : ""}.`,
    r.years.length ? `Por ano: ${r.years.map((y) => `${y.year} ${y.roas ?? "-"}x`).join(", ")}.` : "",
    best.length ? `Candidatas a rodar: ${best.join("; ")}.` : "Nenhuma campanha existente passou na regra de retorno.",
    r.warnings.length ? `Avisos: ${r.warnings.join(" ")}` : "",
  ].filter(Boolean).join(" ").slice(0, 7900);
}

/** O payload tem limite de 20 mil caracteres: guarda so o essencial de cada campanha. */
function compact(r: StrategyReport) {
  return {
    ...r,
    campaigns: r.campaigns.slice(0, 12).map((c) => ({ ...c, reason: c.reason.slice(0, 240) })),
    plan: r.plan.map((p) => ({ ...p, why: p.why.slice(0, 300) })),
  };
}
