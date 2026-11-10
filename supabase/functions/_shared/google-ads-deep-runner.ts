/**
 * Executor da coleta "profunda": roda datasets (estrutura + desempenho detalhado) de UMA conta, somente leitura no Google.
 * Para antes do tempo limite e devolve o que ficou pendente em `skipped` (quem chamou repete so esses).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { GoogleAdsCredentials } from "./google-ads-api.ts";
import { STRUCTURE_DATASETS } from "./google-ads-deep-structure.ts";
import { STATS_DATASETS } from "./google-ads-deep-stats.ts";
import { type Dataset, mergeRows, type Snap } from "./google-ads-deep-types.ts";

export const ALL_DATASETS: Dataset[] = [...STRUCTURE_DATASETS, ...STATS_DATASETS];
const byName = new Map(ALL_DATASETS.map((d) => [d.name, d]));
export const DATASET_NAMES = ALL_DATASETS.map((d) => d.name);

/**
 * Presets (cada cron chama um, para ficar abaixo do limite de CPU do runtime):
 *  structure = o que muda com frequencia (2x/dia); stats = desempenho detalhado recente (1x/dia); static = pesado e lento (semanal).
 */
export const PRESETS: Record<string, string[]> = {
  structure: ["conversion_goals", "account_settings", "campaign_settings", "ad_groups", "ads", "keywords", "negatives", "user_lists", "bidding_strategies",
    "google_recommendations", "changes"],
  stats: ["impression_share", "campaign_conversions", "device_monthly", "search_terms"],
  static: ["hour_stats", "products", "landing_pages", "demographics", "geo", "asset_groups", "asset_group_assets"],
  all: DATASET_NAMES,
};

const UPSERT_CHUNK = 1000;
export const LIFETIME_START = "2015-01-01";

/** Alinha o inicio da janela: dados mensais comecam no dia 1 do mes; anuais, em 1o de janeiro (evita gravar total parcial). */
export function snapStart(start: string, snap: Snap): string {
  if (snap === "month") return `${start.slice(0, 7)}-01`;
  if (snap === "year") return `${start.slice(0, 4)}-01-01`;
  return start;
}

export function defaultWindow(now = new Date(), days = 190): { start: string; end: string } {
  return { start: new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

export interface DeepResult {
  account_id: string;
  ok: boolean;
  done: Array<{ dataset: string; rows: number }>;
  skipped: string[];
  errors: Array<{ dataset: string; error: string }>;
}

export interface DeepAccount { id: string; tenant_id: string; customer_id: string; login_customer_id: string | null }

export async function runDeep(
  supabase: SupabaseClient, account: DeepAccount, creds: GoogleAdsCredentials,
  names: string[], opts: { start: string; end: string; budgetMs: number; actor: string },
): Promise<DeepResult> {
  const result: DeepResult = { account_id: account.id, ok: true, done: [], skipped: [], errors: [] };
  const started = Date.now();
  const accountCreds = { ...creds, loginCustomerId: account.login_customer_id ?? creds.loginCustomerId };

  for (const name of names) {
    const ds = byName.get(name);
    if (!ds) { result.errors.push({ dataset: name, error: "dataset desconhecido" }); continue; }
    if (Date.now() - started > opts.budgetMs) { result.skipped.push(name); continue; }
    const ctx = {
      creds: accountCreds, customerId: account.customer_id, tenantId: account.tenant_id, accountId: account.id,
      start: snapStart(opts.start, ds.snap), end: opts.end, lifetimeStart: LIFETIME_START,
    };
    try {
      let count = 0;
      if (ds.custom) {
        count = await ds.custom(ctx, supabase);
      } else if (ds.table) {
        let rows = await ds.fetch(ctx);
        const keys = ds.conflict.split(",");
        rows = mergeRows(rows, keys, ds.sum ?? []);
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
          const { error } = await supabase.from(ds.table).upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: ds.conflict });
          if (error) throw new Error(`gravar ${ds.table}: ${error.message}`);
        }
        count = rows.length;
      }
      result.done.push({ dataset: name, rows: count });
    } catch (err) {
      result.ok = false;
      result.errors.push({ dataset: name, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
    }
  }

  if (result.done.length) {
    await supabase.from("google_ads_accounts").update({ deep_synced_at: new Date().toISOString() }).eq("id", account.id);
  }
  await supabase.from("google_ads_audit_log").insert({
    tenant_id: account.tenant_id, account_id: account.id, actor: opts.actor, action: "sync_deep",
    after_state: { done: result.done, skipped: result.skipped, errors: result.errors, start: opts.start, end: opts.end },
  });
  return result;
}
