SELECT cron.schedule(
  'bulk-li-status-update-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bulk-status-update-li',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"target_status":"delivered","limit":9}'::jsonb
  );
  $$
);