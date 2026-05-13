-- Daily cron to sync Instagram insights from Meta Graph API (runs at 06:00 UTC = 03:00 BRT)
SELECT cron.schedule(
  'instagram-sync-insights-daily',
  '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-sync-insights',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;$$
);
