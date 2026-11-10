/** Avalia o resultado das mudancas aplicadas (7 e 14 dias depois). So le o banco; nada vai ao Google nem a IA. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { classifyAction, evaluateOutcome, isMature, sumWindow, windowsFor, type DayRow } from "./google-ads-outcome-core.ts";

const HORIZONS = [7, 14] as const;

interface AuditRow { id: string; entity: string; created_at: string; before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null }

export async function evaluateOutcomes(supabase: SupabaseClient, accountId: string, now = new Date()): Promise<{ ok: boolean; evaluated?: number; error?: string }> {
  try {
    const { data: acc, error: accErr } = await supabase.from("google_ads_accounts").select("tenant_id, guardrails").eq("id", accountId).maybeSingle();
    if (accErr || !acc) throw new Error(accErr?.message ?? "conta nao encontrada");
    const g = (acc.guardrails ?? {}) as Record<string, unknown>;
    const minRoas = typeof g.min_roas === "number" && g.min_roas > 0 ? g.min_roas : 4;

    const since = new Date(now.getTime() - 75 * 86_400_000).toISOString();
    const [applied, reverts, done] = await Promise.all([
      supabase.from("google_ads_audit_log").select("id, entity, created_at, before_state, after_state").eq("account_id", accountId).eq("action", "apply").gte("created_at", since).order("created_at", { ascending: false }).limit(300),
      supabase.from("google_ads_audit_log").select("entity, created_at").eq("account_id", accountId).eq("action", "revert").gte("created_at", since).limit(300),
      supabase.from("google_ads_action_outcomes").select("audit_id, horizon_days").eq("account_id", accountId).limit(1000),
    ]);
    for (const r of [applied, reverts, done]) if (r.error) throw new Error(r.error.message);

    const doneKeys = new Set((done.data ?? []).map((d) => `${d.audit_id}:${d.horizon_days}`));
    const revertedAfter = (a: AuditRow) => (reverts.data ?? []).some((r) => r.entity === a.entity && r.created_at > a.created_at);
    let evaluated = 0;

    for (const a of (applied.data ?? []) as AuditRow[]) {
      if (a.after_state?.confirmed === false) continue;            // o Google nao confirmou: nao houve mudanca para medir
      const cls = classifyAction(a.entity, a.before_state, a.after_state);
      if (!cls || revertedAfter(a)) continue;
      const when = new Date(a.created_at);
      for (const h of HORIZONS) {
        if (doneKeys.has(`${a.id}:${h}`) || !isMature(when, h, now)) continue;
        const w = windowsFor(when, h);
        let q = supabase.from("google_ads_campaign_daily").select("campaign_id, date, cost_micros, clicks, conversions, conversions_value")
          .eq("account_id", accountId).gte("date", w.beforeFrom).lte("date", w.afterTo).limit(1000);
        if (cls.campaignId != null) q = q.eq("campaign_id", cls.campaignId);
        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        const days = (rows ?? []) as DayRow[];
        const before = sumWindow(days, w.beforeFrom, w.beforeTo), after = sumWindow(days, w.afterFrom, w.afterTo);
        const ev = evaluateOutcome(cls.kind, before, after, minRoas);
        const { error: insErr } = await supabase.from("google_ads_action_outcomes").upsert({
          tenant_id: acc.tenant_id, account_id: accountId, audit_id: a.id, horizon_days: h, action_kind: cls.kind, entity: a.entity,
          campaign_id: cls.campaignId, applied_at: a.created_at, before_metrics: before, after_metrics: after, verdict: ev.verdict, note: ev.note,
        }, { onConflict: "audit_id,horizon_days" });
        if (insErr) throw new Error(insErr.message);
        evaluated++;
      }
    }
    return { ok: true, evaluated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
