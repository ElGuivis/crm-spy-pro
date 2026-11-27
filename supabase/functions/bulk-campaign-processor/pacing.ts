// Limite diário POR NÚMERO (instância) com aquecimento; com vários números, cada um tem o seu.
// Limite de hoje = daily_limit + daily_limit_step × (dias anteriores em que esta campanha enviou).
// Conta TODOS os disparos do mesmo número no dia (Brasília), para duas campanhas não somarem acima do limite.
// deno-lint-ignore no-explicit-any
type Client = any;

export interface DailyCheck { allowed: boolean; limit: number | null; sentToday: number }

export async function checkDailyLimit(
  supabase: Client, campaignId: string, integrationId: string, dailyLimit: number | null, step: number | null,
): Promise<DailyCheck> {
  if (!dailyLimit || dailyLimit <= 0) return { allowed: true, limit: null, sentToday: 0 };
  const { data, error } = await supabase.rpc("get_bulk_daily_usage", { _campaign_id: campaignId, _integration_id: integrationId });
  if (error) throw new Error(`get_bulk_daily_usage: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { sent_today?: number; days_before?: number } | null;
  const sentToday = row?.sent_today ?? 0;
  const limit = dailyLimit + Math.max(0, step ?? 0) * (row?.days_before ?? 0);
  return { allowed: sentToday < limit, limit, sentToday };
}

/** Segundos até a meia-noite de Brasília (UTC-3, sem horário de verão) + até 10 min de folga aleatória. */
export function secondsUntilNextBrtDay(now = new Date()): number {
  const brt = new Date(now.getTime() - 3 * 3600_000);
  const next = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 1) + 3 * 3600_000;
  return Math.ceil((next - now.getTime()) / 1000) + Math.floor(Math.random() * 600);
}

export { isWithinSendingWindow } from "../_shared/bulk-schedule.ts";
