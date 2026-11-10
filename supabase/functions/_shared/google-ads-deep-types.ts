/** Tipos e auxiliares comuns da coleta "profunda" do Google Ads (somente leitura). */
import type { GoogleAdsCredentials } from "./google-ads-api.ts";

// deno-lint-ignore no-explicit-any
export type Row = any; // linha GAQL em camelCase (aninhamento varia por consulta)

export interface DatasetCtx {
  creds: GoogleAdsCredentials;
  customerId: string;
  tenantId: string;
  accountId: string;
  start: string; // AAAA-MM-DD (so para datasets de periodo)
  end: string;
  lifetimeStart: string;
}

export type Snap = "month" | "year" | null;

export interface Dataset {
  name: string;
  /** Tabela de destino; null quando o dataset atualiza outra coisa por conta propria (`custom`). */
  table: string | null;
  conflict: string;
  /** Datasets de periodo: alinha o inicio da janela (evita sobrescrever um mes/ano com soma parcial). */
  snap: Snap;
  /** Campos numericos somados quando varias linhas caem na mesma chave. */
  sum?: string[];
  fetch: (ctx: DatasetCtx) => Promise<Record<string, unknown>[]>;
  custom?: (ctx: DatasetCtx, supabase: unknown) => Promise<number>;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const nul = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";
export const METRIC_FIELDS = ["impressions", "clicks", "cost_micros", "conversions", "conversions_value"];

export const met = (r: Row) => {
  const m = r.metrics ?? {};
  return {
    impressions: num(m.impressions), clicks: num(m.clicks), cost_micros: num(m.costMicros),
    conversions: num(m.conversions), conversions_value: num(m.conversionsValue),
  };
};

export const base = (ctx: DatasetCtx) => ({ tenant_id: ctx.tenantId, account_id: ctx.accountId, synced_at: new Date().toISOString() });

/** "customers/123/geoTargetConstants/20106" -> "20106" */
export const lastId = (resource: unknown): string | null => {
  const s = str(resource);
  return s ? s.split("/").pop() ?? null : null;
};

/**
 * O Google devolve datas/horas no FUSO DA CONTA ("2026-11-09 20:47:22.006835"). Converte para UTC ISO ("...Z") usando o fuso IANA.
 * Sem fuso valido, assume UTC (comportamento antigo).
 */
export function localToUtcIso(local: string, timeZone: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?/.exec(local);
  if (!m) return null;
  const frac = m[7] ?? "";
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let offset = 0;
  if (timeZone) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
      offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - guess;
    } catch { offset = 0; }
  }
  const iso = new Date(guess - offset).toISOString().slice(0, 19);
  return `${iso}${frac}Z`;
}

/** Junta varias linhas da mesma chave somando os campos numericos informados. */
export function mergeRows(rows: Record<string, unknown>[], keys: string[], sum: string[]): Record<string, unknown>[] {
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const k = keys.map((c) => String(r[c])).join("\u0001");
    const prev = out.get(k);
    if (!prev) { out.set(k, { ...r }); continue; }
    for (const f of sum) prev[f] = num(prev[f]) + num(r[f]);
  }
  return [...out.values()];
}
