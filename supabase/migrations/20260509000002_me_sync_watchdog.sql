-- Watchdog cron job: re-trigger melhor-envio sync_shipments for any stalled
-- me_sync_jobs row. A job is "stalled" if status = 'running' and updated_at
-- is older than 60 seconds (function call ends after ~50s by design).
-- Runs every minute.

SELECT cron.schedule(
  'me-sync-watchdog',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/melhor-envio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object(
      'action', 'sync_shipments',
      'tenantId', j.tenant_id,
      'integrationId', j.integration_id
    )
  )
  FROM public.me_sync_jobs j
  JOIN public.integrations i ON i.id = j.integration_id
  WHERE j.status = 'running'
    AND j.updated_at < NOW() - INTERVAL '60 seconds'
    AND i.type = 'melhor_envio'
    AND i.status = 'connected';
  $$
);
