-- Add cron job to process outbound queue every 10 seconds (minimum is 1 minute for pg_cron)
SELECT cron.schedule(
  'process-outbound-queue-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/process-outbound-queue',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmd0bmFzdmVya2txa2JubXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjgyMzksImV4cCI6MjA5Mzc0NDIzOX0.spmW9Cn5TqQBIjLvWSD4yDOLNtYTXhhYC1PTO-1ck8U", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);