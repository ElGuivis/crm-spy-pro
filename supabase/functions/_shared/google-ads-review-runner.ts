/** Aplica o revisor (google-ads-review-rules) as propostas abertas da conta. Nao escreve no Google Ads. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { reviewProposals, type CampInfo, type OpenRec } from "./google-ads-review-rules.ts";

const KINDS = ["adjust_budget", "enable_campaign", "pause_campaign", "rebuild_search_structure"];

export async function reviewOpenProposals(supabase: SupabaseClient, accountId: string, now = new Date()): Promise<{ ok: boolean; blocked?: number; error?: string }> {
  try {
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [recs, camps, daily] = await Promise.all([
      supabase.from("google_ads_recommendations").select("id, kind, payload").eq("account_id", accountId).eq("status", "pending").in("kind", KINDS),
      supabase.from("google_ads_campaigns").select("campaign_id, name, status, daily_budget_micros").eq("account_id", accountId),
      supabase.from("google_ads_campaign_daily").select("campaign_id, date").eq("account_id", accountId).gte("date", since).gt("cost_micros", 0).limit(1000),
    ]);
    for (const r of [recs, camps, daily]) if (r.error) throw new Error(r.error.message);

    const days = new Map<number, Set<string>>();
    for (const d of (daily.data ?? []) as Array<{ campaign_id: number; date: string }>) {
      const id = Number(d.campaign_id);
      (days.get(id) ?? days.set(id, new Set()).get(id)!).add(String(d.date));
    }
    const campInfo: CampInfo[] = ((camps.data ?? []) as Array<{ campaign_id: number; name: string; status: string; daily_budget_micros: number | null }>).map((c) => ({
      campaign_id: Number(c.campaign_id), name: c.name, status: c.status,
      daily_budget_micros: c.daily_budget_micros == null ? null : Number(c.daily_budget_micros), days_with_spend_14d: days.get(Number(c.campaign_id))?.size ?? 0,
    }));

    const blocked = reviewProposals((recs.data ?? []) as OpenRec[], campInfo);
    for (const b of blocked) {
      const { error } = await supabase.from("google_ads_recommendations").update({ status: "blocked", error: b.reason.slice(0, 500) }).eq("id", b.id).eq("status", "pending");
      if (error) throw new Error(error.message);
    }
    return { ok: true, blocked: blocked.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
