-- Automatic retention for cron.job_run_details and net._http_response.
-- These tables have no retention by default and blew up to 776 MB (393 + 383),
-- triggering Supabase's read-only mode. This cron runs daily and keeps only 7 days.

CREATE OR REPLACE FUNCTION public.cleanup_operational_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  cutoff timestamptz := NOW() - INTERVAL '7 days';
BEGIN
  DELETE FROM cron.job_run_details WHERE start_time < cutoff;
  DELETE FROM net._http_response    WHERE created < cutoff;
END;
$$;

-- Daily at 02:00 BRT (05:00 UTC), before the LGPD cleanup at 06:00 UTC
SELECT cron.schedule(
  'operational-logs-cleanup-daily',
  '0 5 * * *',
  $$SELECT public.cleanup_operational_logs()$$
);
