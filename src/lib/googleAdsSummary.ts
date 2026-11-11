import type { CampaignSpend, GoogleAdsAccount, GoogleAdsAccountBudget, GoogleAdsCampaign, GoogleAdsRecommendation } from "@/hooks/useGoogleAds";
import type { ConversionActionRow } from "@/hooks/useGoogleAdsInsights";
import { activeBudget, asSeverity, brl, CHANNEL_LABEL, readMonthlyCapMicros, SEVERITY_LABEL } from "@/lib/googleAds";

/** Notas iniciais (editáveis na tela): decisões que costumam se repetir. O dono pode trocar o texto. */
export const DEFAULT_CLAUDE_NOTES = [
  "- O Google conta pedido feito, não pedido pago: Pix não pago também entra como conversão. Decida pela receita paga do CRM.",
  "- Só a compra deve ser conversão principal; carrinho e início de checkout ficam secundárias.",
  "- Evite “420” nos anúncios e só use ofertas e prazos que a loja confirmou.",
  "- Não mudar orçamento, meta de ROAS ou estratégia durante o período de medição (pelo menos 14 dias e 10 conversões).",
].join("\n");

const INSTRUCTIONS = [
  "Você vai me ajudar a analisar e decidir sobre o Google Ads da minha loja. Regras:",
  "- Responda em português simples; sou iniciante em Google Ads (explique siglas na primeira vez).",
  "- Você só propõe. Quem aplica qualquer mudança sou eu, pelo painel (botão Implementar). Nunca peça senhas, chaves ou dados de clientes.",
  "- Use só os números abaixo. Se algo não estiver aqui, diga que não sabe em vez de inventar.",
  "- Não recomende mexer em orçamento ou meta com poucos dias de dados ou poucas conversões.",
].join("\n");

const num = (n: number, digits = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const readNum = (g: unknown, key: string): number | null => {
  if (!g || typeof g !== "object") return null;
  const v = (g as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
};

export interface SummaryInput {
  account: GoogleAdsAccount;
  budgets: GoogleAdsAccountBudget[];
  campaigns: GoogleAdsCampaign[];
  spend: Map<number, CampaignSpend>;
  alerts: GoogleAdsRecommendation[];
  conversionActions: ConversionActionRow[];
  notes: string;
  now?: Date;
}

function campaignLines(i: SummaryInput): string[] {
  const rows = i.campaigns.filter((c) => c.status === "ENABLED");
  if (rows.length === 0) return ["Nenhuma campanha ligada."];
  return rows.map((c) => {
    const s = i.spend.get(c.campaign_id);
    const cost = (s?.cost_micros ?? 0) / 1e6;
    const value = s?.conversions_value ?? 0;
    const roas = cost > 0 ? ` · ROAS ${num(value / cost, 2)}` : "";
    const tgt = c.target_roas ? ` · meta ROAS ${num(c.target_roas, 1)}` : "";
    return `- ${c.name} (${CHANNEL_LABEL[c.channel_type ?? ""] ?? c.channel_type ?? "—"}, ${c.bidding_strategy_type ?? "—"}${tgt}): `
      + `orçamento ${brl(c.daily_budget_micros)}/dia · 30 dias: gasto ${brl(s?.cost_micros ?? 0)}, ${num(s?.clicks ?? 0)} cliques, `
      + `${num(s?.conversions ?? 0, 1)} conversões, valor ${brl(Math.round(value * 1e6))}${roas}`;
  });
}

function conversionLines(i: SummaryInput): string[] {
  const rows = i.conversionActions.filter((a) => a.status === "ENABLED");
  if (rows.length === 0) return ["Sem ações de conversão ativas na leitura mais recente."];
  return rows.map((a) => `- ${a.name} [${a.category ?? "—"}]: ${a.primary_for_goal ? "principal" : "secundária"}${a.include_in_conversions_metric ? ", conta nas conversões" : ""}`);
}

/** Resumo em texto para colar numa conversa com o Claude. Não inclui dados de clientes. */
export function buildClaudeSummary(i: SummaryInput): string {
  const { account } = i;
  const budget = activeBudget(i.budgets);
  const limit = budget ? (budget.adjusted_spending_limit_micros ?? budget.approved_spending_limit_micros ?? 0) : 0;
  const remaining = budget ? Math.max(limit - (budget.amount_served_micros ?? 0), 0) : null;
  const cap = readMonthlyCapMicros(account.guardrails);
  const minRoas = readNum(account.guardrails, "min_roas");
  const when = (i.now ?? new Date()).toLocaleString("pt-BR");
  const alerts = i.alerts.slice(0, 8).map((a) => `- [${SEVERITY_LABEL[asSeverity(a.severity)]}] ${a.title}: ${a.rationale.slice(0, 200)}`);
  const paused = i.campaigns.filter((c) => c.status === "PAUSED").length;

  return [
    `# Resumo do Google Ads — ${account.descriptive_name ?? "Conta"} (${when})`,
    "", "## Como me ajudar", INSTRUCTIONS,
    "", "## Regras do dono",
    `- Teto mensal de gasto: ${cap != null ? brl(cap) : "não definido"}`,
    `- ROAS mínimo: ${minRoas != null ? num(minRoas, 1) : "não definido"}`,
    `- Modo do painel: ${account.mode} (mudanças só com aprovação)`,
    "", "## Conta",
    `- Status: ${account.customer_status ?? "—"} · faturamento: ${account.billing_status ?? "—"}`,
    `- Saldo restante do limite da conta: ${remaining != null ? brl(remaining) : "sem limite por saldo"}`,
    `- Última sincronização: ${account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("pt-BR") : "nunca"}`,
    "", "## Campanhas ligadas (últimos 30 dias)", ...campaignLines(i), `- Campanhas pausadas: ${paused}`,
    "", "## Ações de conversão ativas", ...conversionLines(i),
    "", "## Alertas pendentes no painel", ...(alerts.length ? alerts : ["Nenhum alerta pendente."]),
    "", "## Notas do dono", i.notes.trim() || "(sem notas)",
  ].join("\n");
}
