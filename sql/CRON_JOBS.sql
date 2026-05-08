-- =============================================================================
-- SPY PRO CRM - CRON JOBS CONSOLIDADOS
-- Gerado em: 2026-04-15
-- Total: 19 cron jobs ativos
-- =============================================================================
-- INSTRUÇÕES:
-- 1. Substitua {SUPABASE_URL} pela URL do seu projeto Supabase
-- 2. Substitua {SUPABASE_ANON_KEY} pela anon key do projeto
-- 3. Requer extensões pg_cron e pg_net habilitadas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Processador de Inatividade de Conversas (a cada 5 minutos)
-- Encerra conversas inativas automaticamente
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-inactive-conversations',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='{SUPABASE_URL}/functions/v1/conversation-inactivity-processor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  );
  $$
);

-- -----------------------------------------------------------------------------
-- 2. Processador de Fila de Mensagens (a cada minuto)
-- Processa mensagens em fila (email, WhatsApp)
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-message-queue-processor-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/message-queue-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 3. Processador de Reconciliação Loja Integrada (a cada 3 minutos)
-- Reconcilia pedidos LI com status atualizado
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-li-reconciliation-processor-every-3-min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/li-reconciliation-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 4. Processador de Jobs Loja Integrada (a cada 5 minutos)
-- Sync incremental de orders/products/customers
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-li-job-processor-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/li-job-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 5. Processador de Aniversariantes (a cada hora)
-- Envia cupons de aniversário via WhatsApp/Email
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-birthday-processor-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/birthday-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 6. Processador de Fila de Saída WhatsApp (a cada minuto)
-- Despacha mensagens da outbound_queue
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-outbound-queue-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/process-outbound-queue',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 7. Cálculo RFM Diário (todos os dias às 7h)
-- Recalcula scores RFM para todos os tenants
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'rfm-daily-calculation',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/rfm-cron-trigger',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body := '{"triggered_by": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 8. Processador de Buffer de IA (a cada 3 minutos)
-- Processa mensagens acumuladas para resposta AI
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-ai-buffer-processor-every-3-min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/ai-buffer-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 9. Processador de Jobs Bling (a cada 3 minutos)
-- Sync incremental de pedidos/clientes Bling
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-bling-job-processor-every-3-min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/bling-job-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 10. Processador de Jobs de Produtos Bling (a cada 5 minutos)
-- Sync de produtos e estoque Bling
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'invoke-bling-products-job-processor-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/bling-products-job-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 11. Agendador de Campanhas em Massa (a cada 3 minutos)
-- Verifica campanhas agendadas e dispara processamento
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'bulk-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/bulk-campaign-scheduler',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 12. Processador de Jobs Melhor Envio (a cada 5 minutos)
-- Sync de envios e rastreamento
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'me-job-processor-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/me-job-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{"action": "process"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 13. Instagram Outbox Dispatch (a cada minuto)
-- Despacha mensagens do outbox Instagram
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-outbox-dispatch-every-30s',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='{SUPABASE_URL}/functions/v1/instagram-outbox-dispatch',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 14. Instagram Webhook Worker (a cada minuto)
-- Processa webhooks recebidos do Instagram
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-webhook-worker-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='{SUPABASE_URL}/functions/v1/instagram-webhook-worker',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 15. Instagram Refresh Token (diário às 3h)
-- Renova tokens de acesso do Instagram
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-refresh-token-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='{SUPABASE_URL}/functions/v1/instagram-refresh-token',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 16. Instagram Metrics Rollup (a cada hora, minuto 15)
-- Agrega métricas diárias do Instagram
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'instagram-metrics-rollup-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url:='{SUPABASE_URL}/functions/v1/instagram-metrics-rollup',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 17. Processador de Lembretes de Cashback (a cada hora)
-- Envia lembretes de cupons prestes a expirar
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-cashback-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/cashback-reminder-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 18. Agendador de Campanhas de Email (a cada 3 minutos)
-- Verifica campanhas de email agendadas e dispara envio
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'email-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/email-campaign-scheduler',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- -----------------------------------------------------------------------------
-- 19. Processador de Reativação de Clientes Inativos (diário às 10h UTC / 7h BRT)
-- Identifica clientes inativos e envia mensagem de reativação com cupom
-- -----------------------------------------------------------------------------
SELECT cron.schedule(
  'reactivation-processor-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/reactivation-processor',
    headers := public.get_internal_headers(),
    body := '{"source": "cron"}'::jsonb
  ) AS request_id;
  $$
);
