
-- Create cron job for li-job-processor (status rotation + notification triggers)
-- Runs every 5 minutes to check for order status changes and fire automations
SELECT cron.schedule(
  'invoke-li-job-processor-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/li-job-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmd0bmFzdmVya2txa2JubXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjgyMzksImV4cCI6MjA5Mzc0NDIzOX0.spmW9Cn5TqQBIjLvWSD4yDOLNtYTXhhYC1PTO-1ck8U"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
