/**
 * Runner do agente "diagnostico-de-conta": le os dados ja sincronizados, roda as regras (google-ads-diagnosis-rules.ts)
 * e mantem os alertas em google_ads_recommendations SEM duplicar:
 *   - situacao nova            -> cria (pending)
 *   - situacao que continua    -> atualiza os numeros (se ainda pending) ou reabre (se tinha sido auto-resolvida)
 *   - situacao que acabou      -> marca como expired (auto-resolvida)
 *   - alerta que o usuario ja aprovou/dispensou -> nao mexe (a decisao dele vale)
 * Nada aqui escreve no Google Ads.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { runDiagnosis, type Finding, type RuleInput } from "./google-ads-diagnosis-rules.ts";

export const DIAGNOSIS_AGENT = "account_diagnosis";
const DAILY_LOOKBACK_DAYS = 14;

export interface DiagnoseResult {
  account_id: string;
  ok: boolean;
  findings?: number;
  created?: number;
  updated?: number;
  reopened?: number;
  resolved?: number;
  error?: string;
}

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
};

export async function diagnoseAccount(
  supabase: SupabaseClient,
  accountId: string,
  actor: string,
  now: Date = new Date(),
): Promise<DiagnoseResult> {
  try {
    const accRes = await supabase.from("google_ads_accounts")
      .select("id, tenant_id, customer_status, billing_status, last_synced_at, guardrails").eq("id", accountId).limit(1);
    const account = must(accRes, "conta")[0] as {
      id: string; tenant_id: string; customer_status: string | null; billing_status: string | null;
      last_synced_at: string | null; guardrails: RuleInput["account"]["guardrails"];
    } | undefined;
    if (!account) throw new Error("conta nao encontrada");

    const since = new Date(now.getTime() - DAILY_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [campaigns, budgets, daily, existingRows] = await Promise.all([
      supabase.from("google_ads_campaigns").select("campaign_id, name, status, serving_status, daily_budget_micros").eq("account_id", accountId),
      supabase.from("google_ads_account_budget")
        .select("status, approved_spending_limit_micros, adjusted_spending_limit_micros, amount_served_micros").eq("account_id", accountId),
      supabase.from("google_ads_campaign_daily").select("campaign_id, date, impressions, cost_micros").eq("account_id", accountId).gte("date", since),
      supabase.from("google_ads_recommendations").select("id, dedupe_key, status")
        .eq("account_id", accountId).eq("agent", DIAGNOSIS_AGENT).not("dedupe_key", "is", null),
    ]);

    const input: RuleInput = {
      now, accountId,
      account: {
        customer_status: account.customer_status, billing_status: account.billing_status,
        last_synced_at: account.last_synced_at, guardrails: account.guardrails ?? {},
      },
      campaigns: must(campaigns, "campanhas") as RuleInput["campaigns"],
      accountBudgets: must(budgets, "limite da conta") as RuleInput["accountBudgets"],
      daily: must(daily, "metricas") as RuleInput["daily"],
    };
    const findings = runDiagnosis(input);
    const existing = new Map((must(existingRows, "alertas") as Array<{ id: string; dedupe_key: string; status: string }>).map((r) => [r.dedupe_key, r]));
    const counts = { created: 0, updated: 0, reopened: 0, resolved: 0 };

    for (const f of findings) {
      const fields = fieldsOf(f);
      const prev = existing.get(f.dedupe_key);
      if (!prev) {
        const { error } = await supabase.from("google_ads_recommendations").insert({
          tenant_id: account.tenant_id, account_id: accountId, agent: DIAGNOSIS_AGENT, dedupe_key: f.dedupe_key, status: "pending", ...fields,
        });
        if (error) throw new Error(`criar alerta: ${error.message}`);
        counts.created++;
      } else if (prev.status === "pending" || prev.status === "expired") {
        const reopen = prev.status === "expired";
        const { error } = await supabase.from("google_ads_recommendations")
          .update({ ...fields, ...(reopen ? { status: "pending", decided_at: null, decided_by: null } : {}) }).eq("id", prev.id);
        if (error) throw new Error(`atualizar alerta: ${error.message}`);
        reopen ? counts.reopened++ : counts.updated++;
      } // approved/rejected/applied/failed: respeita a decisao do usuario
    }

    const activeKeys = new Set(findings.map((f) => f.dedupe_key));
    for (const prev of existing.values()) {
      if (prev.status === "pending" && !activeKeys.has(prev.dedupe_key)) {
        const { error } = await supabase.from("google_ads_recommendations").update({ status: "expired" }).eq("id", prev.id);
        if (error) throw new Error(`resolver alerta: ${error.message}`);
        counts.resolved++;
      }
    }

    await supabase.from("google_ads_audit_log").insert({
      tenant_id: account.tenant_id, account_id: accountId, actor, action: "diagnose",
      after_state: { findings: findings.length, rules: findings.map((f) => f.rule), ...counts },
    });
    return { account_id: accountId, ok: true, findings: findings.length, ...counts };
  } catch (err) {
    return { account_id: accountId, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}

function fieldsOf(f: Finding) {
  return { kind: f.kind, title: f.title, rationale: f.rationale, payload: f.payload, risk: f.risk, severity: f.severity };
}
