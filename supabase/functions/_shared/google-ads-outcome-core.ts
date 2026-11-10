/** Medicao de resultado das acoes aplicadas (funcoes puras): janelas de datas, soma de metricas e veredito. */

export type ActionKind = "budget" | "enable" | "pause" | "rebuild" | "negatives" | "goal";
export type Verdict = "improved" | "neutral" | "worsened" | "insufficient" | "expected";

export interface DayRow { campaign_id: number; date: string; cost_micros: number; clicks: number; conversions: number; conversions_value: number }
export interface Window { cost: number; clicks: number; conversions: number; value: number; days: number; roas: number | null }

export const OUTCOME = {
  minAfterCost: 30,   // R$ gastos depois da mudanca; abaixo disso nao ha amostra
  minAfterClicks: 20,
  minBeforeCost: 20,  // antes com pouco gasto nao serve de comparacao: usa o ROAS minimo como referencia
  improveRatio: 1.10,
  worsenRatio: 0.85,
} as const;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** O dia da mudanca fica de fora (e parcial). Antes: 7 dias anteriores. Depois: `horizon` dias seguintes. */
export function windowsFor(appliedAt: Date, horizon: 7 | 14) {
  const d = Date.UTC(appliedAt.getUTCFullYear(), appliedAt.getUTCMonth(), appliedAt.getUTCDate());
  return { beforeFrom: iso(d - 7 * DAY), beforeTo: iso(d - DAY), afterFrom: iso(d + DAY), afterTo: iso(d + horizon * DAY) };
}

/** A janela "depois" so pode ser avaliada quando termina ao menos 1 dia antes de hoje (conversoes atrasam um pouco). */
export function isMature(appliedAt: Date, horizon: 7 | 14, now: Date): boolean {
  return Date.parse(windowsFor(appliedAt, horizon).afterTo) + 2 * DAY <= now.getTime();
}

export function sumWindow(rows: DayRow[], from: string, to: string, campaignId?: number): Window {
  const sel = rows.filter((r) => r.date >= from && r.date <= to && (campaignId == null || Number(r.campaign_id) === campaignId));
  const cost = sel.reduce((a, r) => a + Number(r.cost_micros), 0) / 1e6;
  const value = sel.reduce((a, r) => a + Number(r.conversions_value), 0);
  return {
    cost: Math.round(cost * 100) / 100, value: Math.round(value * 100) / 100,
    clicks: sel.reduce((a, r) => a + Number(r.clicks), 0), conversions: Math.round(sel.reduce((a, r) => a + Number(r.conversions), 0) * 100) / 100,
    days: new Set(sel.filter((r) => Number(r.cost_micros) > 0).map((r) => r.date)).size,
    roas: cost > 0 ? Math.round((value / cost) * 100) / 100 : null,
  };
}

/** Tipo da acao e campanha a partir do registro de auditoria (entidade + estado antes/depois). */
export function classifyAction(entity: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): { kind: ActionKind; campaignId: number | null } | null {
  let m = /^campaign:(\d+)$/.exec(entity);
  if (m) {
    const id = Number(m[1]);
    const toStatus = after?.status, fromStatus = before?.status;
    if (toStatus === "PAUSED" && fromStatus !== "PAUSED") return { kind: "pause", campaignId: id };
    if (toStatus === "ENABLED" && fromStatus !== "ENABLED") return { kind: "enable", campaignId: id };
    return { kind: "budget", campaignId: id };
  }
  m = /^(negatives|rebuild):(\d+)$/.exec(entity);
  if (m) return { kind: m[1] as ActionKind, campaignId: Number(m[2]) };
  if (/^goal:[A-Z_]+~[A-Z_]+$/.test(entity)) return { kind: "goal", campaignId: null };
  return null;
}

export function evaluateOutcome(kind: ActionKind, before: Window, after: Window, minRoas: number): { verdict: Verdict; note: string } {
  const f = (v: number | null) => (v == null ? "n/d" : `${v.toLocaleString("pt-BR")}x`);
  if (kind === "pause") return { verdict: "expected", note: `Campanha pausada: gasto foi de R$ ${before.cost} (7 dias antes) para R$ ${after.cost}.` };
  if (after.cost < OUTCOME.minAfterCost || after.clicks < OUTCOME.minAfterClicks) {
    return { verdict: "insufficient", note: `Amostra pequena depois da mudanca (R$ ${after.cost}, ${after.clicks} cliques): ainda nao da para concluir.` };
  }
  const lo = minRoas * 0.75;
  if (before.cost >= OUTCOME.minBeforeCost && before.roas != null && after.roas != null) {
    const ratio = after.roas / before.roas;
    const verdict: Verdict = ratio >= OUTCOME.improveRatio ? "improved" : ratio <= OUTCOME.worsenRatio ? "worsened" : "neutral";
    return { verdict, note: `ROAS ${f(before.roas)} antes, ${f(after.roas)} depois (gasto R$ ${before.cost} -> R$ ${after.cost}, receita R$ ${before.value} -> R$ ${after.value}).` };
  }
  const roas = after.roas;
  const verdict: Verdict = roas == null ? "insufficient" : roas >= minRoas ? "improved" : roas < lo ? "worsened" : "neutral";
  return { verdict, note: `Sem base de comparacao antes; ROAS depois ${f(roas)} contra o minimo de ${minRoas}x.` };
}

export interface Accuracy { kind: ActionKind; improved: number; neutral: number; worsened: number; measured: number; hit_rate: number | null }

/** Taxa de acerto = (melhorou + neutro) / medidas. Ignora "amostra insuficiente" e "efeito esperado". */
export function accuracyByKind(rows: Array<{ action_kind: ActionKind; verdict: Verdict }>): Accuracy[] {
  const by = new Map<ActionKind, Accuracy>();
  for (const r of rows) {
    if (r.verdict === "insufficient" || r.verdict === "expected") continue;
    const a = by.get(r.action_kind) ?? { kind: r.action_kind, improved: 0, neutral: 0, worsened: 0, measured: 0, hit_rate: null };
    a[r.verdict]++; a.measured++;
    by.set(r.action_kind, a);
  }
  return [...by.values()].map((a) => ({ ...a, hit_rate: a.measured ? Math.round(((a.improved + a.neutral) / a.measured) * 100) : null }));
}
