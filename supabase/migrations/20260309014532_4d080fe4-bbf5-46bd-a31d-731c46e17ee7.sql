
-- Ensure email_campaign_logs has event_type and event_data columns (added in Phase 4 but verifying)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_campaign_logs' AND column_name='event_type'
  ) THEN
    ALTER TABLE public.email_campaign_logs ADD COLUMN event_type text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_campaign_logs' AND column_name='event_data'
  ) THEN
    ALTER TABLE public.email_campaign_logs ADD COLUMN event_data jsonb;
  END IF;
END;
$$;
