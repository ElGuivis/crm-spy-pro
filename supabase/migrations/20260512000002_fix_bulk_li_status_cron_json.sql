-- Fix bulk-li-status-update-cron: invalid JSON (unquoted keys)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'bulk-li-status-update-cron'),
  command := $cmd$
   SELECT net.http_post(
     url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bulk-status-update-li',
     headers := public.get_internal_headers(),
     body := '{"target_status":"delivered","limit":9}'::jsonb,
     timeout_milliseconds := 30000
   );
$cmd$
);
