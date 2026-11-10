/** Agente "economia da loja" (sem IA): mede o CRM, grava o resultado e devolve o ponto de equilibrio. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  computeBreakEven, DEFAULT_INPUTS, DEFAULT_TARGETS, reconcile, validateEconomicsInputs, validateTargets,
  type BreakEven, type EconomicsInputs, type EconomicsMetrics, type ReconRow, type ReconSummary, type RoasTargets,
} from "./google-ads-economics-core.ts";

export const WINDOW_MONTHS = 24;

export interface EconomicsView {
  metrics: EconomicsMetrics; inputs: EconomicsInputs; targets: RoasTargets; break_even: BreakEven; reconciliation: ReconSummary; computed_at: string;
}

export function readSettings(guardrails: Record<string, unknown> | null): { inputs: EconomicsInputs; targets: RoasTargets } {
  const g = guardrails ?? {};
  const saved = validateEconomicsInputs(g.economics);
  const inputs = saved.ok ? saved.value : DEFAULT_INPUTS;
  const t = validateTargets({
    min_roas: typeof g.min_roas === "number" ? g.min_roas : DEFAULT_TARGETS.min_roas,
    target_roas: typeof g.target_roas === "number" ? g.target_roas : DEFAULT_TARGETS.target_roas,
    alert_roas: typeof g.alert_roas === "number" ? g.alert_roas : DEFAULT_TARGETS.alert_roas,
  });
  return { inputs, targets: t.ok ? t.value : DEFAULT_TARGETS };
}

export async function refreshEconomics(supabase: SupabaseClient, accountId: string): Promise<{ ok: boolean; view?: EconomicsView; error?: string }> {
  try {
    const { data: acc, error: accErr } = await supabase.from("google_ads_accounts").select("id, tenant_id, guardrails").eq("id", accountId).maybeSingle();
    if (accErr || !acc) throw new Error(accErr?.message ?? "conta nao encontrada");
    const { data, error } = await supabase.rpc("google_ads_crm_economics", { p_account: accountId, p_months: WINDOW_MONTHS });
    if (error) throw new Error(error.message);
    const metrics = (data as { metrics: EconomicsMetrics }).metrics;
    const recon = reconcile(((data as { reconciliation: ReconRow[] }).reconciliation ?? []));
    const computedAt = new Date().toISOString();
    const { error: upErr } = await supabase.from("google_ads_unit_economics").upsert({
      tenant_id: acc.tenant_id, account_id: accountId, window_months: WINDOW_MONTHS, metrics, reconciliation: recon.rows, computed_at: computedAt,
    }, { onConflict: "account_id,window_months" });
    if (upErr) throw new Error(upErr.message);
    const { inputs, targets } = readSettings(acc.guardrails as Record<string, unknown> | null);
    return { ok: true, view: { metrics, inputs, targets, break_even: computeBreakEven(metrics, inputs, targets.min_roas), reconciliation: recon, computed_at: computedAt } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Salva numeros do dono e/ou metas de ROAS em guardrails (com antes/depois na auditoria). */
export async function saveEconomicsSettings(
  supabase: SupabaseClient, a: { accountId: string; tenantId: string; actor: string; inputs?: unknown; targets?: unknown },
): Promise<{ ok: boolean; error?: string }> {
  const { data: acc } = await supabase.from("google_ads_accounts").select("guardrails").eq("id", a.accountId).eq("tenant_id", a.tenantId).maybeSingle();
  if (!acc) return { ok: false, error: "Conta nao encontrada" };
  const before = (acc.guardrails ?? {}) as Record<string, unknown>;
  const after: Record<string, unknown> = { ...before };
  if (a.inputs !== undefined) {
    const v = validateEconomicsInputs(a.inputs);
    if (!v.ok) return { ok: false, error: v.error };
    after.economics = v.value;
  }
  if (a.targets !== undefined) {
    const v = validateTargets(a.targets);
    if (!v.ok) return { ok: false, error: v.error };
    Object.assign(after, v.value);
  }
  const { error } = await supabase.from("google_ads_accounts").update({ guardrails: after }).eq("id", a.accountId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("google_ads_audit_log").insert({
    tenant_id: a.tenantId, account_id: a.accountId, actor: a.actor, action: "guardrails_change", entity: "economics", before_state: before, after_state: after,
  });
  return { ok: true };
}
