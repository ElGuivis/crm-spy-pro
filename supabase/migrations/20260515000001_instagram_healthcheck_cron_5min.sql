-- Change instagram-healthcheck cron from every 6h to every 5min
-- so webhook subscription is re-established quickly after a Meta-side drop
SELECT cron.schedule(
  'instagram-healthcheck-every-6h',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-healthcheck',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;$$
);
