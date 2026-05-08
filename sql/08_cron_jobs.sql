-- =============================================================================
-- CRON JOBS - Tarefas Agendadas
-- =============================================================================
-- NOTA: Requer extensões pg_cron e pg_net habilitadas no Supabase
--
-- AUTENTICAÇÃO: Os cron jobs usam a função get_internal_headers() que lê o
-- CRON_SECRET do vault do PostgreSQL e envia no header x-cron-secret.
-- Isso é validado pelo requireInternalAuth() nas Edge Functions.
--
-- PRÉ-REQUISITOS:
--   1. Função get_internal_headers() criada (ver migration)
--   2. CRON_SECRET armazenado no vault via store_cron_secret()
--   3. Substituir {SUPABASE_URL} pela URL real do projeto

-- -----------------------------------------------------------------------------
-- 1. Processador de Reconciliação Loja Integrada (a cada 3 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-li-reconciliation-processor-every-3-min',
  '*/3 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/li-reconciliation-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 2. Processador de Buffer de IA (a cada 3 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-ai-buffer-processor-every-3-min',
  '*/3 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/ai-buffer-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 3. Processador de Fila de Mensagens (a cada minuto)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-message-queue-processor-every-1-min',
  '* * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/message-queue-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 4. Processador de Lembretes de Cashback (a cada hora)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-cashback-reminders-hourly',
  '0 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/cashback-reminder-processor', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 5. Processador de Inatividade de Conversas (a cada 5 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-inactive-conversations',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/conversation-inactivity-processor', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 6. Processador de Jobs Bling (a cada 3 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-bling-job-processor-every-3-min',
  '*/3 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/bling-job-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 7. Processador de Jobs de Produtos Bling (a cada 5 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-bling-products-job-processor-every-5-min',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/bling-products-job-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 8. Agendador de Campanhas em Massa (a cada 3 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'bulk-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/bulk-campaign-scheduler', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 9. Processador de Aniversariantes (a cada hora)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-birthday-processor-hourly',
  '0 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/birthday-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 10. Processador de Jobs Loja Integrada (a cada 5 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-li-job-processor-every-5-min',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/li-job-processor', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 11. Processador de Jobs Melhor Envio (a cada 5 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'me-job-processor-every-5-min',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/me-job-processor', headers:=get_internal_headers(), body:='{"action":"process"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 12. Processador de Fila de Saída (a cada minuto)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-outbound-queue-every-1-min',
  '* * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/process-outbound-queue', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 13. Cálculo RFM Diário (todos os dias às 7h)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'rfm-daily-calculation',
  '0 7 * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/rfm-cron-trigger', headers:=get_internal_headers(), body:='{"triggered_by":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 14. Agendador de Campanhas de Email (a cada 3 minutos)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'email-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/email-campaign-scheduler', headers:=get_internal_headers(), body:='{}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 15. Despacho de Outbox Instagram (a cada minuto)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-outbox-dispatch-every-30s',
  '* * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/instagram-outbox-dispatch', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 16. Worker de Webhooks Instagram (a cada minuto)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-webhook-worker-every-minute',
  '* * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/instagram-webhook-worker', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 17. Refresh de Token Instagram (diário às 3h)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-refresh-token-daily',
  '0 3 * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/instagram-refresh-token', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);

-- -----------------------------------------------------------------------------
-- 18. Rollup de Métricas Instagram (a cada hora, minuto 15)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-metrics-rollup-hourly',
  '15 * * * *',
  $$SELECT net.http_post(url:='{SUPABASE_URL}/functions/v1/instagram-metrics-rollup', headers:=get_internal_headers(), body:='{"source":"cron"}'::jsonb) AS request_id;$$
);
