-- Reativação de clientes: reserva antes de enviar (sem mensagem duplicada) e histórico por pessoa/compra.
-- Aplicar com: psql --single-transaction -v ON_ERROR_STOP=1 -f <este arquivo>

-- customer_key: telefone normalizado (com 55) ou e-mail; attempt_no: 1, 2, 3... dentro da mesma "inatividade" (mesma última compra).
ALTER TABLE public.reactivation_executions
  ADD COLUMN IF NOT EXISTS customer_key text,
  ADD COLUMN IF NOT EXISTS attempt_no integer;

-- Uma reserva por (configuração, pessoa, última compra, tentativa): duas execuções ao mesmo tempo (ou uma que caiu no meio)
-- nunca mandam a mesma mensagem duas vezes. Linhas antigas sem customer_key ficam de fora.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reactivation_exec_attempt
  ON public.reactivation_executions (config_id, customer_key, last_order_date, attempt_no)
  WHERE customer_key IS NOT NULL;
