-- LGPD Log Retention Policy
-- Automatically purges operational logs older than 90 days.
-- Tables excluded: webhook events tied to orders (fiscal retention 5yr),
--   conversation_events (user-owned), nuvemshop_lgpd_events (compliance record).

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := NOW() - INTERVAL '90 days';
BEGIN
  DELETE FROM public.ai_usage_logs         WHERE created_at < cutoff;
  DELETE FROM public.email_events          WHERE created_at < cutoff;
  DELETE FROM public.email_campaign_logs   WHERE created_at < cutoff;
  DELETE FROM public.function_metrics      WHERE created_at < cutoff;
  DELETE FROM public.instagram_event_log   WHERE created_at < cutoff;
  DELETE FROM public.instagram_comment_replies_log WHERE created_at < cutoff;
  DELETE FROM public.instagram_data_collection_events WHERE created_at < cutoff;
END;
$$;

-- Daily at 03:00 BRT (06:00 UTC)
SELECT cron.schedule(
  'lgpd-log-cleanup-daily',
  '0 6 * * *',
  $$SELECT public.cleanup_old_logs()$$
);
