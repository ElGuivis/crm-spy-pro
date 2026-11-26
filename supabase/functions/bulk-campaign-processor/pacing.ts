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

/**
 * Check if current time (in campaign timezone) falls within the sending schedule.
 * Returns true if no schedule is set or if currently within a valid window.
 */
export function isWithinSendingWindow(
  schedule: Record<string, { start: string; end: string }> | null,
  tz: string | null
): boolean {
  if (!schedule || Object.keys(schedule).length === 0) return true;

  const timezone = tz || "America/Sao_Paulo";
  // Get current time in the campaign's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parts.find(p => p.type === "hour")?.value || "00";
  const minute = parts.find(p => p.type === "minute")?.value || "00";
  const currentTime = `${hour}:${minute}`;

  // Map weekday name to JS day number (0=Sun)
  const dayMap: Record<string, string> = {
    Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6",
  };
  const dayKey = dayMap[weekdayStr];
  if (!dayKey) return true;

  const window = schedule[dayKey];
  if (!window) return false; // Day not in schedule = no sending

  return currentTime >= window.start && currentTime < window.end;
}
