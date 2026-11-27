// Horário de envio do disparo em massa (bulk_campaigns.sending_schedule, no fuso da campanha: Brasília).
// Usado pelo processador do disparo e pela resposta automática (fora do horário ela fica agendada).
/**
 * Check if current time (in campaign timezone) falls within the sending schedule.
 * Returns true if no schedule is set or if currently within a valid window.
 */
export function isWithinSendingWindow(
  schedule: Record<string, { start: string; end: string }> | null,
  tz: string | null,
  now: Date = new Date(),
): boolean {
  if (!schedule || Object.keys(schedule).length === 0) return true;

  const timezone = tz || "America/Sao_Paulo";
  // Get current time in the campaign's timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // meia-noite = 00 (com hour12:false alguns motores devolvem 24)
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

type Schedule = Record<string, { start: string; end: string }> | null;

/** Horário da resposta automática: o da campanha; campanha sem horário = 08:00–21:00 todos os dias (Brasília). */
export const DEFAULT_REPLY_WINDOW = { start: "08:00", end: "21:00" };
export function replyWindowOpen(schedule: Schedule, tz: string | null, now: Date = new Date()): boolean {
  const s = schedule && Object.keys(schedule).length > 0
    ? schedule
    : Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, DEFAULT_REPLY_WINDOW]));
  return isWithinSendingWindow(s, tz || "America/Sao_Paulo", now);
}
