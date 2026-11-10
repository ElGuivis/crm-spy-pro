/**
 * Agente "consultor-de-estrategia" (tipo A: regras em codigo, sem IA, sem tokens).
 * Responde: com a verba mensal que temos, o que reativar, o que manter desligado e quanto colocar em cada campanha.
 * Funcoes puras: recebem dados ja lidos do banco e devolvem um relatorio. Nada aqui fala com o Google.
 *
 * Premissas (todas aparecem no relatorio, nunca escondidas):
 *  - ROAS = receita das conversoes / gasto. O "ponto de equilibrio" depende da margem do negocio, que o sistema nao conhece:
 *    se o usuario nao definiu `min_roas`, usamos 3,0 como valor PROVISORIO e dizemos isso.
 *  - Amostra pequena (gasto < R$ 500 na vida da campanha) nao sustenta conclusao: veredito "dados insuficientes".
 *  - Campanha REMOVIDA nao volta; so se recria.
 */

export const STRATEGY = {
  provisionalMinRoas: 3.0,
  minLifetimeSpendMicros: 500_000_000, // R$ 500
  recentActiveMonths: 3, // ultimos N meses COM gasto da campanha
  maxActiveCampaigns: 3, // foco: verba pequena concentrada em poucas campanhas
  capacityFactor: 1.3, // nao pedir mais que 1,3x o que a campanha ja conseguiu gastar por dia
  minDailyBudgetMicros: 10_000_000, // R$ 10/dia
  daysPerMonth: 30.4,
  roundToMicros: 1_000_000, // arredonda para R$ 1
  staleAfterDays: 365, // evidencia de campanha parada ha mais que isso vale menos (mercado mudou)
  staleFactor: 0.75,
  runningBonus: 1.15, // quem ja esta ligada nao reinicia aprendizado nem precisa de nova aprovacao
} as const;

/** Nota de prioridade: mistura ROAS da vida e recente, desconta evidencia velha, favorece quem ja roda. */
export function priorityScore(a: { status: string; lifetime: { roas: number | null }; recent: { roas: number | null }; dormant_days: number | null }): number {
  const base = ((a.lifetime.roas ?? 0) + (a.recent.roas ?? 0)) / 2;
  const stale = a.dormant_days !== null && a.dormant_days > STRATEGY.staleAfterDays ? STRATEGY.staleFactor : 1;
  return base * stale * (a.status === "ENABLED" ? STRATEGY.runningBonus : 1);
}

export interface CampaignInfo {
  campaign_id: number;
  name: string;
  status: string; // ENABLED | PAUSED | REMOVED
  channel_type: string | null;
  daily_budget_micros: number | null;
}
export interface LifetimeRow {
  campaign_id: number;
  cost_micros: number;
  conversions_value: number;
  first_spend_date: string | null;
  last_spend_date: string | null;
}
export interface MonthlyRow {
  campaign_id: number;
  month: string; // AAAA-MM-01
  cost_micros: number;
  conversions_value: number;
  days_with_spend: number;
}
export interface ConversionActionInfo {
  name: string;
  status: string;
  category: string | null;
  primary_for_goal: boolean | null;
  include_in_conversions_metric: boolean | null;
}

export type Verdict = "running" | "reactivate" | "test_small" | "keep_off" | "insufficient" | "removed";

export interface CampaignAnalysis {
  campaign_id: number;
  name: string;
  channel_type: string | null;
  status: string;
  verdict: Verdict;
  reason: string;
  lifetime: { cost: number; revenue: number; roas: number | null; first: string | null; last: string | null };
  recent: { months: string[]; cost: number; revenue: number; roas: number | null };
  dormant_days: number | null;
  avg_daily_spend_when_active: number | null; // em R$
  current_daily_budget: number | null; // em R$
}

export interface PlanLine {
  campaign_id: number;
  name: string;
  action: "set_budget" | "enable" | "pause";
  daily_budget_micros: number | null;
  why: string;
}

export interface StrategyReport {
  generated_at: string;
  assumptions: string[];
  min_roas: number;
  min_roas_is_provisional: boolean;
  monthly_cap: number | null;
  daily_target: number | null;
  years: Array<{ year: number; cost: number; revenue: number; roas: number | null }>;
  campaigns: CampaignAnalysis[];
  plan: PlanLine[];
  warnings: string[];
}

export interface StrategyInput {
  now: Date;
  monthlyCapMicros: number | null;
  minRoas: number | null;
  campaigns: CampaignInfo[];
  lifetime: LifetimeRow[];
  monthly: MonthlyRow[];
  conversionActions: ConversionActionInfo[];
  /** campanha -> motivos de NAO veicular hoje (so as que sabemos que nao veiculam). */
  unready?: Map<number, string[]>;
  /** ROAS minimo proprio de uma campanha (tem prioridade sobre o minimo da conta). */
  campaignMinRoas?: Map<number, number>;
}

const brl = (micros: number) => Math.round(micros / 10_000) / 100;
const roasOf = (revenue: number, costMicros: number): number | null =>
  costMicros > 0 ? Math.round((revenue / (costMicros / 1e6)) * 100) / 100 : null;
const daysBetween = (a: string, b: Date) => Math.floor((b.getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
const fmtBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Conversoes que costumam inflar o numero de "conversoes" sem representar venda. */
const NOISY_CATEGORIES = new Set(["DOWNLOAD", "PHONE_CALL_LEAD", "CONTACT", "GET_DIRECTIONS", "PAGE_VIEW", "ENGAGEMENT"]);

export function analyzeCampaign(
  c: CampaignInfo,
  life: LifetimeRow | undefined,
  months: MonthlyRow[],
  minRoas: number,
  now: Date,
): CampaignAnalysis {
  const cost = life?.cost_micros ?? 0;
  const revenue = life?.conversions_value ?? 0;
  const spendMonths = months.filter((m) => m.cost_micros > 0).sort((a, b) => a.month.localeCompare(b.month));
  const recentMonths = spendMonths.slice(-STRATEGY.recentActiveMonths);
  const rCost = recentMonths.reduce((s, m) => s + m.cost_micros, 0);
  const rRev = recentMonths.reduce((s, m) => s + m.conversions_value, 0);
  const rDays = recentMonths.reduce((s, m) => s + m.days_with_spend, 0);
  const lifeRoas = roasOf(revenue, cost);
  const recentRoas = roasOf(rRev, rCost);
  const dormant = life?.last_spend_date ? daysBetween(life.last_spend_date, now) : null;

  const base = {
    campaign_id: c.campaign_id, name: c.name, channel_type: c.channel_type, status: c.status,
    lifetime: { cost: brl(cost), revenue: Math.round(revenue * 100) / 100, roas: lifeRoas, first: life?.first_spend_date ?? null, last: life?.last_spend_date ?? null },
    recent: { months: recentMonths.map((m) => m.month.slice(0, 7)), cost: brl(rCost), revenue: Math.round(rRev * 100) / 100, roas: recentRoas },
    dormant_days: dormant,
    avg_daily_spend_when_active: rDays > 0 ? brl(rCost / rDays) : null,
    current_daily_budget: c.daily_budget_micros == null ? null : brl(c.daily_budget_micros),
  };

  let verdict: Verdict;
  let reason: string;
  if (c.status === "REMOVED") {
    verdict = "removed"; reason = "Campanha removida: nao volta. Se o formato foi bom, o caminho e recriar.";
  } else if (cost < STRATEGY.minLifetimeSpendMicros) {
    verdict = "insufficient"; reason = `Gastou so ${fmtBrl(brl(cost))} na vida: amostra pequena demais para concluir.`;
  } else if (lifeRoas !== null && recentRoas !== null && lifeRoas >= minRoas && recentRoas >= minRoas) {
    verdict = c.status === "ENABLED" ? "running" : "reactivate";
    reason = `ROAS ${lifeRoas}x na vida e ${recentRoas}x nos ultimos meses ativos, acima do minimo de ${minRoas}x.`;
  } else if (lifeRoas !== null && lifeRoas >= minRoas) {
    verdict = "test_small";
    reason = `Foi bem na vida (${lifeRoas}x), mas o final foi fraco (${recentRoas ?? "sem dado"}x). Se voltar, so com verba pequena e prazo curto para provar.`;
  } else {
    verdict = "keep_off";
    reason = `ROAS ${lifeRoas ?? "sem dado"}x na vida, abaixo do minimo de ${minRoas}x. Nao vale gastar a verba limitada aqui.`;
  }
  return { ...base, verdict, reason };
}

export function buildStrategy(input: StrategyInput): StrategyReport {
  const { now } = input;
  const minRoas = input.minRoas && input.minRoas > 0 ? input.minRoas : STRATEGY.provisionalMinRoas;
  const provisional = !(input.minRoas && input.minRoas > 0);
  const lifeBy = new Map(input.lifetime.map((l) => [l.campaign_id, l]));
  const monthsBy = new Map<number, MonthlyRow[]>();
  for (const m of input.monthly) (monthsBy.get(m.campaign_id) ?? monthsBy.set(m.campaign_id, []).get(m.campaign_id)!).push(m);

  const analyses = input.campaigns
    .filter((c) => (lifeBy.get(c.campaign_id)?.cost_micros ?? 0) > 0 || c.status === "ENABLED")
    .map((c) => analyzeCampaign(c, lifeBy.get(c.campaign_id), monthsBy.get(c.campaign_id) ?? [], input.campaignMinRoas?.get(c.campaign_id) ?? minRoas, now))
    .sort((a, b) => b.lifetime.cost - a.lifetime.cost);

  // Historico por ano (conta toda).
  const yearMap = new Map<number, { cost: number; rev: number }>();
  for (const m of input.monthly) {
    const y = Number(m.month.slice(0, 4));
    const e = yearMap.get(y) ?? { cost: 0, rev: 0 };
    e.cost += m.cost_micros; e.rev += m.conversions_value; yearMap.set(y, e);
  }
  const years = [...yearMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([year, e]) => ({ year, cost: brl(e.cost), revenue: Math.round(e.rev), roas: roasOf(e.rev, e.cost) }));

  const capMicros = input.monthlyCapMicros && input.monthlyCapMicros > 0 ? input.monthlyCapMicros : null;
  const dailyTargetMicros = capMicros ? Math.floor(capMicros / STRATEGY.daysPerMonth) : null;

  const warnings: string[] = [];
  const noisy = input.conversionActions.filter((a) =>
    a.status === "ENABLED" && a.primary_for_goal && a.category && NOISY_CATEGORIES.has(a.category));
  if (noisy.length) {
    warnings.push(`Conversoes ativas e principais que nao sao venda e podem enganar o algoritmo de lances: ${noisy.map((a) => a.name).join("; ")}.`);
  }
  const hiddenGa4 = input.conversionActions.filter((a) => a.status === "HIDDEN" && /ga4/i.test(a.name));
  if (hiddenGa4.length) warnings.push(`${hiddenGa4.length} conversao(oes) do GA4 estao ocultas no Google Ads: confira se a venda esta chegando pela tag certa.`);
  if (provisional) warnings.push(`ROAS minimo PROVISORIO de ${STRATEGY.provisionalMinRoas}x. Informe o seu (1 / margem de lucro) para o plano ficar certo.`);
  if (!capMicros) warnings.push("Teto mensal nao definido: o plano de verba nao foi calculado.");

  // Plano de verba: so campanhas que a regra aprova, no maximo N, pesos pelo ROAS recente.
  const plan: PlanLine[] = [];
  if (dailyTargetMicros) {
    const unready = input.unready ?? new Map<number, string[]>();
    for (const a of analyses.filter((x) => (x.verdict === "running" || x.verdict === "reactivate") && unready.has(x.campaign_id))) {
      warnings.push(`"${a.name}" passou na regra de retorno, mas hoje nao consegue veicular (${unready.get(a.campaign_id)!.join("; ")}). Corrija no Google Ads antes de contar com ela; a verba foi para as campanhas que veiculam.`);
    }
    const candidates = analyses
      .filter((a) => (a.verdict === "running" || a.verdict === "reactivate") && !unready.has(a.campaign_id))
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, STRATEGY.maxActiveCampaigns);
    const weightSum = candidates.reduce((s, a) => s + Math.max(priorityScore(a), 0.1), 0);
    // 1a passada: parte proporcional a nota, limitada ao que a campanha ja provou gastar por dia.
    const alloc = candidates.map((a) => {
      const share = Math.floor(dailyTargetMicros * (Math.max(priorityScore(a), 0.1) / weightSum));
      const capacity = a.avg_daily_spend_when_active ? Math.round(a.avg_daily_spend_when_active * 1e6 * STRATEGY.capacityFactor) : share;
      const round = (v: number) => Math.max(Math.floor(v / STRATEGY.roundToMicros) * STRATEGY.roundToMicros, STRATEGY.minDailyBudgetMicros);
      return { a, capacity: round(capacity), b: round(Math.min(share, capacity)) };
    });
    // Estourou o teto por causa do piso minimo? Tira o excesso de quem tem menor nota.
    let used = alloc.reduce((s, x) => s + x.b, 0);
    for (let i = alloc.length - 1; i >= 0 && used > dailyTargetMicros; i--) {
      const cut = Math.min(alloc[i].b, used - dailyTargetMicros);
      alloc[i].b -= cut; used -= cut;
    }
    // 2a passada: a sobra vai para quem tem capacidade comprovada, na ordem de prioridade.
    for (const x of alloc) {
      if (x.b < STRATEGY.minDailyBudgetMicros) continue;
      const extra = Math.min(dailyTargetMicros - used, x.capacity - x.b);
      if (extra >= STRATEGY.roundToMicros) { const add = Math.floor(extra / STRATEGY.roundToMicros) * STRATEGY.roundToMicros; x.b += add; used += add; }
    }
    const picked = new Set<number>();
    for (const x of alloc) {
      if (x.b < STRATEGY.minDailyBudgetMicros) continue;
      picked.add(x.a.campaign_id);
      const camp = input.campaigns.find((c) => c.campaign_id === x.a.campaign_id)!;
      // Ja esta exatamente assim no Google: nao ha o que aplicar (evita pendencia vazia depois de aplicar o plano).
      if (camp.status === "ENABLED" && camp.daily_budget_micros === x.b) continue;
      plan.push({
        campaign_id: x.a.campaign_id, name: x.a.name,
        action: camp.status === "ENABLED" ? "set_budget" : "enable",
        daily_budget_micros: x.b,
        why: `${x.a.reason} Verba diaria proposta ${fmtBrl(brl(x.b))} (parte do teto de ${fmtBrl(brl(dailyTargetMicros))}/dia).`,
      });
    }
    // Quem esta ligado e nao entrou no plano sai (pausa), senao estoura o teto.
    for (const c of input.campaigns.filter((c) => c.status === "ENABLED" && !picked.has(c.campaign_id))) {
      plan.push({
        campaign_id: c.campaign_id, name: c.name, action: "pause", daily_budget_micros: null,
        why: unready.has(c.campaign_id)
          ? `Ligada, mas nao consegue veicular (${unready.get(c.campaign_id)!.join("; ")}): gasta zero e ocupa verba do plano.`
          : "Fora do foco da verba atual: manter ligada estouraria o teto mensal.",
      });
    }
    const planned = plan.reduce((s, p) => s + (p.daily_budget_micros ?? 0), 0);
    if (planned > 0 && dailyTargetMicros - planned >= 5_000_000) {
      warnings.push(`Sobram ${fmtBrl(brl(dailyTargetMicros - planned))}/dia do teto sem destino: as campanhas aprovadas nao costumam gastar mais que isso. Esse e o espaco para testar uma campanha nova.`);
    }
    if (!plan.some((p) => p.action !== "pause")) {
      warnings.push("Nenhuma campanha existente passou na regra de retorno: considere recriar a partir dos formatos que melhor funcionaram.");
    }
  }

  return {
    generated_at: now.toISOString(),
    assumptions: [
      "ROAS = receita das conversoes / gasto, como o Google informa.",
      "Verba mensal dividida por 30,4 dias; no maximo 3 campanhas ativas ao mesmo tempo.",
      "Nao pedimos mais verba por dia do que a campanha ja conseguiu gastar (x1,3), porque nao ha como gastar o que nao ha demanda.",
      "Resultados passados nao garantem resultados futuros; o mercado e os concorrentes mudaram desde a ultima vez que as campanhas giraram.",
    ],
    min_roas: minRoas,
    min_roas_is_provisional: provisional,
    monthly_cap: capMicros ? brl(capMicros) : null,
    daily_target: dailyTargetMicros ? brl(dailyTargetMicros) : null,
    years,
    campaigns: analyses.slice(0, 14),
    plan,
    warnings,
  };
}
