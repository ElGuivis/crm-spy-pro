/**
 * Regras extras do diagnostico (tipo A: sem IA). Funcoes puras.
 * R8 mudanca feita fora do sistema | R9 ROAS dos ultimos 7 dias abaixo do alerta/minimo
 * R10 ritmo de gasto fora do esperado | R11 anuncio reprovado em campanha ligada
 * R12 duas acoes de compra principais com conversoes recentes (risco de contar o pedido 2x)
 * R13 gastou, vendeu no CRM e o Google registrou zero conversoes (rastreamento pode estar quebrado)
 */
import type { Finding, Severity } from "./google-ads-diagnosis-rules.ts";

export interface ExtraDaily { campaign_id: number; date: string; cost_micros: number; conversions_value: number; conversions?: number }
export interface ExtraAction { name: string; category: string | null; status: string; primary_for_goal: boolean | null }
export interface ExtraConvMonth { conversion_action_name: string; month: string; conversions: number }
export interface ExtraChange { changed_at: string; client_type: string | null; resource_type: string | null; user_email: string | null }
export interface ExtraAd { campaign_id: number; status: string; approval_status: string | null }
export interface ExtraCampaign { campaign_id: number; name: string; status: string; daily_budget_micros: number | null }
export interface ExtraInput {
  now: Date; accountId: string; campaigns: ExtraCampaign[]; daily: ExtraDaily[]; changes: ExtraChange[]; ads: ExtraAd[];
  minRoas: number; alertRoas: number;
  actions?: ExtraAction[]; convMonthly?: ExtraConvMonth[]; crmPaidOrders14d?: number | null;
}

export const EXTRA = {
  roasMinCost: 50,        // R$ gastos nos 7 dias para o ROAS ter significado
  paceMinDays: 3,         // dias com gasto na janela para avaliar ritmo
  paceHigh: 1.3, paceLow: 0.4,
  externalWindowHours: 24,
} as const;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d: Date) => d.toISOString().slice(0, 10);

function mk(f: Omit<Finding, "risk"> & { risk?: Finding["risk"] }): Finding {
  const risk = f.risk ?? (f.severity === "critical" || f.severity === "high" ? "high" : f.severity === "medium" ? "medium" : "low");
  return { ...f, risk };
}

export function runExtraDiagnosis(i: ExtraInput): Finding[] {
  const out: Finding[] = [];
  const from = day(new Date(i.now.getTime() - 7 * 86_400_000)), today = day(i.now);
  const win = i.daily.filter((d) => d.date >= from && d.date < today); // 7 dias COMPLETOS (hoje e parcial)
  const cost = win.reduce((s, d) => s + Number(d.cost_micros), 0) / 1e6;
  const value = win.reduce((s, d) => s + Number(d.conversions_value), 0);
  const enabled = i.campaigns.filter((c) => c.status === "ENABLED");

  // R8: alteracoes feitas direto no painel do Google (nao pela API do sistema)
  const since = i.now.getTime() - EXTRA.externalWindowHours * 3_600_000;
  const external = i.changes.filter((c) => c.client_type !== "GOOGLE_ADS_API" && Date.parse(c.changed_at) >= since);
  if (external.length) {
    const kinds = [...new Set(external.map((c) => c.resource_type ?? "?"))];
    const who = [...new Set(external.map((c) => c.user_email).filter(Boolean))];
    out.push(mk({
      rule: "R8", severity: "low", kind: "alert", dedupe_key: `R8:${i.accountId}`,
      title: `${external.length} alteracao(oes) feita(s) direto no painel do Google nas ultimas ${EXTRA.externalWindowHours}h`,
      rationale: `Tipos: ${kinds.join(", ")}${who.length ? `; por ${who.join(", ")}` : ""}. Mudancas fora do sistema nao passam pelas travas nem pela auditoria daqui. Os dados foram relidos, mas confira se bate com o plano.`,
      payload: { count: external.length, resource_types: kinds, users: who },
    }));
  }

  // R9: ROAS dos ultimos 7 dias completos
  if (cost >= EXTRA.roasMinCost) {
    const roas = value / cost;
    const severity: Severity | null = roas < i.alertRoas ? "high" : roas < i.minRoas ? "medium" : null;
    if (severity) {
      const r = Math.round(roas * 100) / 100;
      out.push(mk({
        rule: "R9", severity, kind: "alert", dedupe_key: `R9:${i.accountId}`,
        title: `ROAS dos ultimos 7 dias em ${r.toLocaleString("pt-BR")}x, ${severity === "high" ? `abaixo do alerta de ${i.alertRoas}x` : `abaixo do minimo de ${i.minRoas}x`}`,
        rationale: `Em 7 dias completos a conta gastou ${brl(cost)} e a receita atribuida pelo Google foi ${brl(value)}. ${severity === "high" ? "Perto ou abaixo do ponto de equilibrio: a conta pode estar perdendo dinheiro." : "Ainda lucrativo, mas abaixo da meta."} Veja a aba Descobertas para os termos e campanhas que mais pesam.`,
        payload: { roas: r, cost, value, min_roas: i.minRoas, alert_roas: i.alertRoas },
      }));
    }
  }

  // R10: ritmo de gasto x orcamento diario somado das campanhas ligadas
  const budgetSum = enabled.reduce((s, c) => s + (c.daily_budget_micros ?? 0), 0) / 1e6;
  const daysWithSpend = new Set(win.filter((d) => Number(d.cost_micros) > 0).map((d) => d.date)).size;
  if (budgetSum > 0 && daysWithSpend >= EXTRA.paceMinDays) {
    const avg = cost / 7;
    if (avg > budgetSum * EXTRA.paceHigh) {
      out.push(mk({ rule: "R10", severity: "medium", kind: "alert", dedupe_key: `R10:${i.accountId}`, title: "Gasto medio acima do orcamento diario somado",
        rationale: `Media de ${brl(avg)}/dia nos ultimos 7 dias contra ${brl(budgetSum)}/dia de orcamento somado. O Google pode gastar ate o dobro em um dia, mas a media nao deveria passar disso por muito tempo.`, payload: { avg_daily: avg, budget_sum: budgetSum } }));
    } else if (avg < budgetSum * EXTRA.paceLow) {
      out.push(mk({ rule: "R10", severity: "low", kind: "alert", dedupe_key: `R10:${i.accountId}`, title: "As campanhas nao estao gastando o orcamento",
        rationale: `Media de ${brl(avg)}/dia nos ultimos 7 dias contra ${brl(budgetSum)}/dia de orcamento somado. Em geral o limite e ranking (lance/qualidade) ou poucas buscas, nao verba: aumentar o orcamento nao ajuda.`, payload: { avg_daily: avg, budget_sum: budgetSum } }));
    }
  }

  // R11: anuncio reprovado dentro de campanha ligada
  const enabledIds = new Set(enabled.map((c) => c.campaign_id));
  const byCamp = new Map<number, { bad: number; good: number }>();
  for (const a of i.ads.filter((x) => x.status === "ENABLED" && enabledIds.has(Number(x.campaign_id)))) {
    const e = byCamp.get(Number(a.campaign_id)) ?? { bad: 0, good: 0 };
    if (a.approval_status === "DISAPPROVED") e.bad++; else if (a.approval_status === "APPROVED") e.good++;
    byCamp.set(Number(a.campaign_id), e);
  }
  for (const [cid, e] of byCamp) {
    if (!e.bad) continue;
    const name = i.campaigns.find((c) => c.campaign_id === cid)?.name ?? String(cid);
    out.push(mk({
      rule: "R11", severity: e.good ? "medium" : "high", kind: "alert", dedupe_key: `R11:${i.accountId}:${cid}`,
      title: `${e.bad} anuncio(s) reprovado(s) em "${name}"${e.good ? "" : ": nenhum anuncio aprovado"}`,
      rationale: e.good
        ? "Ha anuncios aprovados rodando, mas os reprovados nao veiculam e ocupam espaco. Corrija o motivo ou remova."
        : "A campanha esta ligada mas nao tem nenhum anuncio aprovado, entao nao veicula. Reprovado nao e reanalisado sozinho: e preciso editar ou recriar o anuncio.",
      payload: { campaign_id: cid, disapproved: e.bad, approved: e.good },
    }));
  }

  // R12: duas acoes de COMPRA principais com conversoes nos ultimos 3 meses -> pode contar o mesmo pedido duas vezes
  const recentMonth = day(new Date(i.now.getTime() - 100 * 86_400_000)).slice(0, 7);
  const purchasePrimary = new Set((i.actions ?? []).filter((a) => a.category === "PURCHASE" && a.primary_for_goal === true && a.status === "ENABLED").map((a) => a.name));
  const active = [...purchasePrimary].filter((n) => (i.convMonthly ?? []).some((m) => m.conversion_action_name === n && m.month.slice(0, 7) >= recentMonth && Number(m.conversions) > 0));
  if (active.length >= 2) {
    out.push(mk({
      rule: "R12", severity: "high", kind: "alert", dedupe_key: `R12:${i.accountId}`,
      title: `${active.length} acoes de compra principais registram conversoes ao mesmo tempo`,
      rationale: `${active.join("; ")}. Se as duas disparam no mesmo pedido, o Google conta a venda em dobro e o ROAS fica inflado. Deixe so uma como principal ou confira se disparam em paginas diferentes.`,
      payload: { actions: active },
    }));
  }

  // R13: gasto relevante + pedidos pagos no CRM + zero conversoes no Google nos ultimos 14 dias completos
  const w14 = i.daily.filter((d) => d.date >= day(new Date(i.now.getTime() - 14 * 86_400_000)) && d.date < today);
  const cost14 = w14.reduce((s, d) => s + Number(d.cost_micros), 0) / 1e6;
  const conv14 = w14.reduce((s, d) => s + Number(d.conversions ?? 0), 0);
  if (i.crmPaidOrders14d != null && cost14 >= 100 && conv14 === 0 && i.crmPaidOrders14d >= 5) {
    out.push(mk({
      rule: "R13", severity: "high", kind: "alert", dedupe_key: `R13:${i.accountId}`,
      title: "O Google nao registrou nenhuma venda, mas o CRM recebeu pedidos",
      rationale: `Nos ultimos 14 dias a conta gastou ${brl(cost14)} com 0 conversoes, enquanto o CRM recebeu ${i.crmPaidOrders14d} pedidos pagos. Pode ser que o rastreamento de compra (tag/pixel) tenha parado. Sem ele os lances automaticos ficam cegos.`,
      payload: { cost_14d: cost14, google_conversions: conv14, crm_paid_orders: i.crmPaidOrders14d },
    }));
  }
  return out;
}
