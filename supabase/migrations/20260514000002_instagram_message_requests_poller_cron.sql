-- Cron every 2 minutes to poll Instagram message requests (pending folder)
SELECT cron.schedule(
  'instagram-message-requests-poller',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-message-requests-poller',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;$$
);
