// Janela de envio das mensagens automáticas, em horário de Brasília (UTC-3 fixo: o Brasil não tem horário de verão desde 2019).
const BRT_OFFSET_MS = 3 * 3_600_000;

/** null = dentro da janela (pode enviar agora). Fora dela, o instante (ms) da próxima abertura. */
export function nextWindowOpen(nowMs: number, startHour: number, endHour: number): number | null {
  if (!(startHour >= 0 && endHour <= 24 && startHour < endHour)) return null; // janela inválida = sem restrição
  const b = new Date(nowMs - BRT_OFFSET_MS);
  const hour = b.getUTCHours() + b.getUTCMinutes() / 60;
  if (hour >= startHour && hour < endHour) return null;
  const todayOpen = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), startHour, 0, 0);
  return (hour < startHour ? todayOpen : todayOpen + 86_400_000) + BRT_OFFSET_MS;
}
