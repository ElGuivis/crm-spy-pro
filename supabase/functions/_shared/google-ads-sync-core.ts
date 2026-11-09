/**
 * Sincronizacao de UMA conta do Google Ads para o banco (somente leitura na API do Google).
 * Grava: metadados da conta, campanhas e metricas diarias por campanha. Registra a trilha de auditoria.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { gaqlSearch, GoogleAdsApiError, type GaqlRow, type GoogleAdsCredentials } from "./google-ads-api.ts";

export const DEFAULT_SYNC_DAYS = 30;
export const MAX_SYNC_DAYS = 365;
const UPSERT_CHUNK = 500;

export interface SyncAccountRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  login_customer_id: string | null;
}

export interface SyncResult {
  account_id: string;
  customer_id: string;
  ok: boolean;
  campaigns?: number;
  daily_rows?: number;
  days?: number;
  start?: string;
  end?: string;
  error?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Aceita "2026-11-09" ou "2026-11-09 03:00:00"; devolve AAAA-MM-DD ou null (o Google usa "2037-12-30" = sem fim). */
export function toDate(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = s.slice(0, 10);
  return d >= "2037-12-30" ? null : d;
}

export function mapCampaignRow(row: GaqlRow, tenantId: string, accountId: string) {
  const c = row.campaign ?? {};
  return {
    tenant_id: tenantId,
    account_id: accountId,
    campaign_id: num(c.id),
    name: str(c.name) ?? "(sem nome)",
    status: str(c.status) ?? "UNKNOWN",
    channel_type: str(c.advertisingChannelType),
    bidding_strategy_type: str(c.biddingStrategyType),
    daily_budget_micros: row.campaignBudget?.amountMicros != null ? num(row.campaignBudget.amountMicros) : null,
    budget_resource_name: str(c.campaignBudget),
    budget_explicitly_shared: typeof row.campaignBudget?.explicitlyShared === "boolean" ? row.campaignBudget.explicitlyShared : null,
    start_date: toDate(c.startDateTime),
    end_date: toDate(c.endDateTime),
    serving_status: str(c.servingStatus),
    primary_status: str(c.primaryStatus),
    primary_status_reasons: Array.isArray(c.primaryStatusReasons) ? c.primaryStatusReasons.filter((x) => typeof x === "string") : [],
    synced_at: new Date().toISOString(),
  };
}

/** "2021-07-06 13:44:45" -> texto aceito pelo Postgres; vazio/invalido -> null. */
function toDateTime(v: unknown): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
}

export function mapAccountBudgetRow(row: GaqlRow, tenantId: string, accountId: string) {
  const b = row.accountBudget ?? {};
  const id = String(b.resourceName ?? "").split("/").pop();
  return {
    tenant_id: tenantId,
    account_id: accountId,
    account_budget_id: num(id),
    status: str(b.status) ?? "UNKNOWN",
    approved_spending_limit_micros: b.approvedSpendingLimitMicros != null ? num(b.approvedSpendingLimitMicros) : null,
    adjusted_spending_limit_micros: b.adjustedSpendingLimitMicros != null ? num(b.adjustedSpendingLimitMicros) : null,
    amount_served_micros: num(b.amountServedMicros),
    approved_start_date_time: toDateTime(b.approvedStartDateTime),
    approved_end_date_time: toDateTime(b.approvedEndDateTime),
    synced_at: new Date().toISOString(),
  };
}

/** Prefere o faturamento APPROVED; senao o primeiro; sem nenhum, null. */
export function pickBillingStatus(rows: GaqlRow[]): string | null {
  const statuses = rows.map((r) => str(r.billingSetup?.status)).filter((s): s is string => !!s);
  return statuses.includes("APPROVED") ? "APPROVED" : (statuses[0] ?? null);
}

export function mapDailyRow(row: GaqlRow, tenantId: string, accountId: string) {
  const m = row.metrics ?? {};
  return {
    tenant_id: tenantId,
    account_id: accountId,
    campaign_id: num(row.campaign?.id),
    date: toDate(row.segments?.date) ?? "",
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    cost_micros: num(m.costMicros),
    conversions: num(m.conversions),
    conversions_value: num(m.conversionsValue),
    synced_at: new Date().toISOString(),
  };
}

/** Intervalo [inicio, fim] em AAAA-MM-DD (UTC) cobrindo os ultimos `days` dias, incluindo hoje. */
export function dateRange(days: number, now = new Date()): { start: string; end: string } {
  const n = Math.min(Math.max(Math.floor(days) || DEFAULT_SYNC_DAYS, 1), MAX_SYNC_DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - (n - 1) * 86_400_000);
  return { start: fmt(startDate), end: fmt(now) };
}

const CAMPAIGN_QUERY = `
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time,
         campaign.serving_status, campaign.primary_status, campaign.primary_status_reasons,
         campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared
  FROM campaign`;

const dailyQuery = (start: string, end: string) => `
  SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'`;

const CONVERSION_ACTION_QUERY = `
  SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type,
         conversion_action.category, conversion_action.origin, conversion_action.primary_for_goal,
         conversion_action.include_in_conversions_metric, conversion_action.counting_type
  FROM conversion_action`;

const conversionMonthlyQuery = (start: string, end: string) => `
  SELECT segments.month, segments.conversion_action_name, metrics.conversions, metrics.conversions_value
  FROM customer
  WHERE segments.date BETWEEN '${start}' AND '${end}'`;

export function mapConversionActionRow(row: GaqlRow, tenantId: string, accountId: string) {
  const c = row.conversionAction ?? {};
  return {
    tenant_id: tenantId,
    account_id: accountId,
    conversion_action_id: num(c.id),
    name: str(c.name) ?? "(sem nome)",
    status: str(c.status) ?? "UNKNOWN",
    type: str(c.type),
    category: str(c.category),
    origin: str(c.origin),
    primary_for_goal: typeof c.primaryForGoal === "boolean" ? c.primaryForGoal : null,
    include_in_conversions_metric: typeof c.includeInConversionsMetric === "boolean" ? c.includeInConversionsMetric : null,
    counting_type: str(c.countingType),
    synced_at: new Date().toISOString(),
  };
}

export function mapConversionMonthlyRow(row: GaqlRow, tenantId: string, accountId: string) {
  const m = row.metrics ?? {};
  return {
    tenant_id: tenantId,
    account_id: accountId,
    month: toDate(row.segments?.month) ?? "",
    conversion_action_name: str(row.segments?.conversionActionName) ?? "(sem nome)",
    conversions: num(m.conversions),
    conversions_value: num(m.conversionsValue),
    synced_at: new Date().toISOString(),
  };
}

const CUSTOMER_QUERY = "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer";
const BILLING_QUERY = "SELECT billing_setup.status FROM billing_setup";
const ACCOUNT_BUDGET_QUERY = `
  SELECT account_budget.status, account_budget.approved_spending_limit_micros,
         account_budget.adjusted_spending_limit_micros, account_budget.amount_served_micros,
         account_budget.approved_start_date_time, account_budget.approved_end_date_time
  FROM account_budget`;

/**
 * Consulta opcional (faturamento / limite da conta): so a PERMISSAO NEGADA (403) vira lista vazia, com aviso.
 * Consulta malformada (400), rede ou token continuam derrubando a sincronizacao: nada de falha silenciosa.
 */
async function optionalSearch(
  creds: GoogleAdsCredentials,
  customerId: string,
  query: string,
  warnings: string[],
): Promise<GaqlRow[]> {
  try {
    return await gaqlSearch(creds, customerId, query);
  } catch (err) {
    if (err instanceof GoogleAdsApiError && err.status === 403) {
      warnings.push(`${query.trim().split(/\s+/).slice(-1)[0]}: ${err.code ?? "403"}`);
      return [];
    }
    throw err;
  }
}

async function upsertChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict });
    if (error) throw new Error(`Falha ao gravar ${table}: ${error.message}`);
  }
}

export async function syncAccount(
  supabase: SupabaseClient,
  account: SyncAccountRow,
  creds: GoogleAdsCredentials,
  opts: { days?: number; actor: string; endDate?: string },
): Promise<SyncResult> {
  const base = { account_id: account.id, customer_id: account.customer_id };
  const { start, end } = dateRange(opts.days ?? DEFAULT_SYNC_DAYS, opts.endDate ? new Date(`${opts.endDate}T12:00:00Z`) : new Date());
  const accountCreds = { ...creds, loginCustomerId: account.login_customer_id ?? creds.loginCustomerId };
  const warnings: string[] = [];

  try {
    const [customerRows, campaignRows, dailyRows, billingRows, budgetRows, convActionRows, convMonthlyRows] = await Promise.all([
      gaqlSearch(accountCreds, account.customer_id, CUSTOMER_QUERY),
      gaqlSearch(accountCreds, account.customer_id, CAMPAIGN_QUERY),
      gaqlSearch(accountCreds, account.customer_id, dailyQuery(start, end)),
      optionalSearch(accountCreds, account.customer_id, BILLING_QUERY, warnings),
      optionalSearch(accountCreds, account.customer_id, ACCOUNT_BUDGET_QUERY, warnings),
      optionalSearch(accountCreds, account.customer_id, CONVERSION_ACTION_QUERY, warnings),
      optionalSearch(accountCreds, account.customer_id, conversionMonthlyQuery(start, end), warnings),
    ]);

    const campaigns = campaignRows.map((r) => mapCampaignRow(r, account.tenant_id, account.id));
    const daily = dailyRows.map((r) => mapDailyRow(r, account.tenant_id, account.id)).filter((r) => r.date);
    const budgets = budgetRows.map((r) => mapAccountBudgetRow(r, account.tenant_id, account.id)).filter((b) => b.account_budget_id > 0);

    await upsertChunks(supabase, "google_ads_campaigns", campaigns, "account_id,campaign_id");
    await upsertChunks(supabase, "google_ads_campaign_daily", daily, "account_id,campaign_id,date");
    await upsertChunks(supabase, "google_ads_account_budget", budgets, "account_id,account_budget_id");

    const convActions = convActionRows.map((r) => mapConversionActionRow(r, account.tenant_id, account.id)).filter((a) => a.conversion_action_id > 0);
    // Agrega por (mes, acao): a consulta pode devolver varias linhas para o mesmo par.
    const convMap = new Map<string, ReturnType<typeof mapConversionMonthlyRow>>();
    for (const r of convMonthlyRows) {
      const row = mapConversionMonthlyRow(r, account.tenant_id, account.id);
      if (!row.month) continue;
      const k = `${row.month}|${row.conversion_action_name}`;
      const prev = convMap.get(k);
      if (prev) { prev.conversions += row.conversions; prev.conversions_value += row.conversions_value; } else convMap.set(k, row);
    }
    await upsertChunks(supabase, "google_ads_conversion_actions", convActions, "account_id,conversion_action_id");
    await upsertChunks(supabase, "google_ads_conversion_monthly", [...convMap.values()], "account_id,month,conversion_action_name");

    const cust = customerRows[0]?.customer ?? {};
    await supabase.from("google_ads_accounts").update({
      descriptive_name: str(cust.descriptiveName),
      currency_code: str(cust.currencyCode),
      time_zone: str(cust.timeZone),
      customer_status: str(cust.status),
      billing_status: pickBillingStatus(billingRows),
      status: "active",
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", account.id);

    await supabase.from("google_ads_audit_log").insert({
      tenant_id: account.tenant_id,
      account_id: account.id,
      actor: opts.actor,
      action: "sync",
      after_state: { campaigns: campaigns.length, daily_rows: daily.length, account_budgets: budgets.length, conversion_actions: convActions.length, conversion_months: convMap.size, warnings, start, end },
    });

    return { ...base, ok: true, campaigns: campaigns.length, daily_rows: daily.length, days: opts.days ?? DEFAULT_SYNC_DAYS, start, end };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await supabase.from("google_ads_accounts").update({ last_error: message }).eq("id", account.id);
    return { ...base, ok: false, error: message };
  }
}
