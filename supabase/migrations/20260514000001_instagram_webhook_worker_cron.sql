-- Cron every minute to process pending instagram_webhook_deliveries
SELECT cron.schedule(
  'instagram-webhook-worker',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-webhook-worker',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;$$
);
