-- Aniversário: no máximo UMA mensagem por pessoa por dia, mesmo com mais de uma configuração ativa na loja.
-- O processador reserva a linha ('pending') ANTES de gerar cupom/enviar; o índice único fecha a corrida entre execuções e configurações.
-- Linhas antigas ficam sem chave (não entram no índice), então o histórico duplicado não bloqueia a migration.
ALTER TABLE public.birthday_executions
  ADD COLUMN IF NOT EXISTS person_key text,
  ADD COLUMN IF NOT EXISTS run_day date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_birthday_once_per_person_day
  ON public.birthday_executions (tenant_id, run_day, person_key)
  WHERE person_key IS NOT NULL AND run_day IS NOT NULL AND status IN ('pending', 'sent');
