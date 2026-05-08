-- Add cron job for Bling auto-sync (every minute)
SELECT cron.schedule(
  'invoke-bling-job-processor-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bling-job-processor',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);