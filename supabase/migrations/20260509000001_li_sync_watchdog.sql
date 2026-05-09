-- Watchdog cron job: re-trigger li-sync for any stalled sync states.
-- A "stalled" sync_state has last_offset > 0 (more pages pending) and
-- updated_at older than 90 seconds (function isn't progressing it anymore).
-- Runs every minute.

SELECT cron.schedule(
  'li-sync-watchdog',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/li-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('integrationId', s.integration_id, 'syncType', s.entity_type)
  )
  FROM public.li_sync_state s
  JOIN public.integrations i ON i.id = s.integration_id
  WHERE s.last_offset > 0
    AND s.updated_at < NOW() - INTERVAL '90 seconds'
    AND i.type = 'loja_integrada'
    AND i.status = 'connected';
  $$
);
