/**
 * Aplicacao CONTROLADA de recomendacoes no Google Ads (unica parte do modulo que escreve na conta).
 * Acoes suportadas: adjust_budget, enable_campaign, pause_campaign (orcamento diario e liga/desliga).
 *
 * Travas (todas no servidor, a tela nao e confiavel):
 *  1. conta em modo read_only -> recusa;  2. ha teto mensal definido;  3. le o estado ATUAL no Google antes de mudar;
 *  4. orcamento compartilhado -> recusa;  5. soma dos orcamentos diarios das ligadas, depois da mudanca, cabe no teto;
 *  6. aumento maximo de 150% de uma vez em campanha ja ligada;  7. teto absoluto de R$ 1.000/dia por campanha;
 *  8. depois de mudar, le de novo e confere;  9. tudo no google_ads_audit_log com antes/depois (permite desfazer).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { gaqlSearch, mutateResource, type GoogleAdsCredentials } from "./google-ads-api.ts";

export const GUARD = {
  daysPerMonth: 30.4,
  maxDailyBudgetMicros: 1_000_000_000, // R$ 1.000 por campanha
  minDailyBudgetMicros: 1_000_000, // R$ 1
  maxIncreaseFactor: 2.5, // +150% de uma vez em campanha ja ligada
  capToleranceMicros: 1_000_000, // arredondamento de centavos no teto
} as const;

export type ApplyKind = "adjust_budget" | "enable_campaign" | "pause_campaign";
export const APPLY_KINDS: ApplyKind[] = ["adjust_budget", "enable_campaign", "pause_campaign"];

export interface GuardInput {
  kind: ApplyKind;
  mode: string;
  monthlyCapMicros: number | null;
  newBudgetMicros: number | null; // orcamento diario desejado (null em pause)
  current: { status: string; budgetMicros: number | null; shared: boolean | null };
  otherEnabledBudgetsMicros: number; // soma dos orcamentos diarios das OUTRAS campanhas ligadas
}

/** Decide se a mudanca pode ir ao Google. Pura e testavel. */
export function checkGuardrails(g: GuardInput): { ok: true } | { ok: false; error: string } {
  const no = (error: string) => ({ ok: false as const, error });
  if (g.mode === "read_only") return no("A conta esta em modo somente leitura. Mude para 'com aprovacao' em Configuracoes antes de aplicar.");
  if (g.current.status === "REMOVED") return no("Campanha removida no Google Ads: nao e possivel alterar.");
  if (g.kind === "pause_campaign") return { ok: true }; // reduzir gasto e sempre permitido

  if (!g.monthlyCapMicros || g.monthlyCapMicros <= 0) return no("Defina o teto mensal de gastos antes de aplicar mudancas de orcamento.");
  if (g.current.shared) return no("O orcamento desta campanha e compartilhado com outras: o sistema nao altera para nao afetar as demais.");
  const b = g.newBudgetMicros;
  if (b == null || !Number.isFinite(b)) return no("Orcamento diario ausente na recomendacao.");
  if (b < GUARD.minDailyBudgetMicros) return no("Orcamento diario abaixo de R$ 1,00.");
  if (b > GUARD.maxDailyBudgetMicros) return no("Orcamento diario acima do limite de seguranca de R$ 1.000,00 por campanha.");

  if (g.current.status === "ENABLED" && g.current.budgetMicros && b > g.current.budgetMicros * GUARD.maxIncreaseFactor) {
    return no("Aumento grande demais de uma vez (maximo +150%): aumentos bruscos reiniciam o aprendizado dos lances. Faca em etapas.");
  }
  const projectedMonthly = (g.otherEnabledBudgetsMicros + b) * GUARD.daysPerMonth;
  if (projectedMonthly > g.monthlyCapMicros + GUARD.capToleranceMicros * GUARD.daysPerMonth) {
    const brl = (m: number) => (m / 1e6).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return no(`Com essa mudanca os orcamentos diarios das campanhas ligadas somariam ${brl(g.otherEnabledBudgetsMicros + b)}/dia (~${brl(projectedMonthly)}/mes), acima do teto de ${brl(g.monthlyCapMicros)}/mes. Reduza ou pause outras campanhas primeiro.`);
  }
  return { ok: true };
}

/** Ordem segura para aplicar um plano: pausar -> reduzir -> o resto (assim o teto nunca e estourado no meio). */
export function orderPlan<T extends { kind: string; payload: { daily_budget_micros?: number | null; campaign_id?: number } }>(
  items: T[], currentBudgets: Map<number, number | null>,
): T[] {
  const rank = (i: T) => {
    if (i.kind === "pause_campaign") return 0;
    const cur = currentBudgets.get(Number(i.payload.campaign_id)) ?? 0;
    const nb = i.payload.daily_budget_micros ?? 0;
    return i.kind === "adjust_budget" && nb < cur ? 1 : 2;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

interface CampaignState { status: string; budgetMicros: number | null; budgetResource: string | null; shared: boolean | null }

async function readCampaignFromGoogle(creds: GoogleAdsCredentials, customerId: string, campaignId: number): Promise<CampaignState> {
  const rows = await gaqlSearch(creds, customerId,
    `SELECT campaign.id, campaign.status, campaign.campaign_budget, campaign_budget.amount_micros, campaign_budget.explicitly_shared
     FROM campaign WHERE campaign.id = ${Math.trunc(campaignId)}`);
  const r = rows[0];
  if (!r) throw new Error("Campanha nao encontrada no Google Ads");
  return {
    status: String(r.campaign?.status ?? "UNKNOWN"),
    budgetMicros: r.campaignBudget?.amountMicros != null ? Number(r.campaignBudget.amountMicros) : null,
    budgetResource: typeof r.campaign?.campaignBudget === "string" ? r.campaign.campaignBudget : null,
    shared: typeof r.campaignBudget?.explicitlyShared === "boolean" ? r.campaignBudget.explicitlyShared : null,
  };
}

export interface ApplyArgs {
  accountId: string;
  tenantId: string;
  actor: string; // 'user:<uuid>'
  kind: ApplyKind;
  campaignId: number;
  newBudgetMicros: number | null;
  /** Usado so no desfazer: status para o qual voltar. */
  restoreStatus?: "ENABLED" | "PAUSED";
  recommendationId?: string | null;
  auditAction?: "apply" | "revert";
}

export interface ApplyOutcome {
  ok: boolean;
  error?: string;
  before?: { status: string; daily_budget_micros: number | null };
  after?: { status: string; daily_budget_micros: number | null };
}

/** Executa UMA mudanca numa campanha, com todas as travas. Nao toca em google_ads_recommendations (quem chama decide). */
export async function applyChange(
  supabase: SupabaseClient, creds: GoogleAdsCredentials, args: ApplyArgs,
): Promise<ApplyOutcome> {
  const { data: account, error: accErr } = await supabase.from("google_ads_accounts")
    .select("id, customer_id, login_customer_id, mode, guardrails").eq("id", args.accountId).eq("tenant_id", args.tenantId).maybeSingle();
  if (accErr || !account) return { ok: false, error: "Conta nao encontrada" };
  const accountCreds = { ...creds, loginCustomerId: account.login_customer_id ?? creds.loginCustomerId };

  let before: CampaignState;
  try { before = await readCampaignFromGoogle(accountCreds, account.customer_id, args.campaignId); }
  catch (e) { return { ok: false, error: `Nao foi possivel ler a campanha no Google: ${(e as Error).message}` }; }

  // Soma dos orcamentos das OUTRAS campanhas ligadas (base local, atualizada pelo ultimo sync).
  const { data: enabled } = await supabase.from("google_ads_campaigns")
    .select("campaign_id, daily_budget_micros").eq("account_id", args.accountId).eq("status", "ENABLED");
  const others = (enabled ?? []).filter((c: { campaign_id: number }) => Number(c.campaign_id) !== args.campaignId)
    .reduce((s: number, c: { daily_budget_micros: number | null }) => s + Number(c.daily_budget_micros ?? 0), 0);

  const cap = (account.guardrails as Record<string, unknown> | null)?.monthly_budget_cap_micros;
  const verdict = checkGuardrails({
    kind: args.kind, mode: account.mode, monthlyCapMicros: typeof cap === "number" ? cap : null,
    newBudgetMicros: args.newBudgetMicros,
    current: { status: before.status, budgetMicros: before.budgetMicros, shared: before.shared },
    otherEnabledBudgetsMicros: others,
  });
  if (!verdict.ok) return { ok: false, error: verdict.error };

  const wantStatus = args.kind === "pause_campaign" ? "PAUSED" : args.kind === "enable_campaign" ? "ENABLED" : (args.restoreStatus ?? before.status);
  const changeBudget = args.kind !== "pause_campaign" && args.newBudgetMicros != null && args.newBudgetMicros !== before.budgetMicros;
  const changeStatus = wantStatus !== before.status && (wantStatus === "ENABLED" || wantStatus === "PAUSED");
  if (changeBudget && !before.budgetResource) return { ok: false, error: "Endereco do orcamento desconhecido; sincronize a conta e tente de novo." };

  const beforeState = { status: before.status, daily_budget_micros: before.budgetMicros };
  try {
    if (changeBudget) {
      await mutateResource(accountCreds, account.customer_id, "campaignBudgets:mutate", {
        update: { resourceName: before.budgetResource, amountMicros: String(args.newBudgetMicros) }, updateMask: "amount_micros",
      });
    }
    if (changeStatus) {
      try {
        await mutateResource(accountCreds, account.customer_id, "campaigns:mutate", {
          update: { resourceName: `customers/${account.customer_id}/campaigns/${Math.trunc(args.campaignId)}`, status: wantStatus }, updateMask: "status",
        });
      } catch (e) {
        if (changeBudget) { // desfaz o orcamento para nao deixar meia-mudanca
          await mutateResource(accountCreds, account.customer_id, "campaignBudgets:mutate", {
            update: { resourceName: before.budgetResource, amountMicros: String(before.budgetMicros) }, updateMask: "amount_micros",
          }).catch(() => undefined);
        }
        throw e;
      }
    }
  } catch (e) {
    return { ok: false, error: `O Google Ads recusou a mudanca: ${(e as Error).message}`, before: beforeState };
  }

  // Confere o resultado de verdade (nao assume que deu certo).
  let after: CampaignState;
  try { after = await readCampaignFromGoogle(accountCreds, account.customer_id, args.campaignId); }
  catch (e) { return { ok: false, error: `Mudanca enviada, mas nao consegui confirmar: ${(e as Error).message}`, before: beforeState }; }
  const afterState = { status: after.status, daily_budget_micros: after.budgetMicros };
  const confirmed = (!changeStatus || after.status === wantStatus) && (!changeBudget || after.budgetMicros === args.newBudgetMicros);

  await supabase.from("google_ads_campaigns").update({ status: after.status, daily_budget_micros: after.budgetMicros, synced_at: new Date().toISOString() })
    .eq("account_id", args.accountId).eq("campaign_id", args.campaignId);
  await supabase.from("google_ads_audit_log").insert({
    tenant_id: args.tenantId, account_id: args.accountId, recommendation_id: args.recommendationId ?? null,
    actor: args.actor, action: args.auditAction ?? "apply", entity: `campaign:${args.campaignId}`,
    before_state: beforeState, after_state: { ...afterState, confirmed },
  });
  if (!confirmed) return { ok: false, error: "O Google respondeu, mas o valor lido depois nao bate com o pedido. Confira a campanha.", before: beforeState, after: afterState };
  return { ok: true, before: beforeState, after: afterState };
}
