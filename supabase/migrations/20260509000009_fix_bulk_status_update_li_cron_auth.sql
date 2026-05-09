-- Cron 20 (bulk-li-status-update-cron) was authenticating with
--   'Bearer ' || current_setting('supabase.service_role_key', true)
-- but that GUC isn't set on this project, so the call sent
-- "Authorization: Bearer null" and bulk-status-update-li returned 500
-- once per minute (the "Unknown error" responses left over after the
-- earlier post-migration cron auth fix).
--
-- Switch to public.get_internal_headers() — same pattern as the other
-- post-migration crons.

SELECT cron.alter_job(
  job_id := 20,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bulk-status-update-li',
    headers := public.get_internal_headers(),
    body := '{"target_status":"delivered","limit":9}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$
);
