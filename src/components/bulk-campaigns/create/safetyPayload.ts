/** Converte os campos do formulário para as colunas da campanha. */
export function safetyPayload(replyMessage: string, dailyLimit: string, dailyStep: string) {
  const limit = parseInt(dailyLimit, 10);
  const step = parseInt(dailyStep, 10);
  return {
    reply_message: replyMessage.trim() || null,
    daily_limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    daily_limit_step: Number.isFinite(step) && step > 0 ? step : 0,
  };
}
