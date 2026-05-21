-- Migrate email-campaign-scheduler edge fn → Postgres function (free 1 slot)
-- Dispatches email-campaign-send for each scheduled campaign whose time has arrived.
-- NOTE: does NOT change status — email-campaign-send atomically claims scheduled→sending.

CREATE OR REPLACE FUNCTION public.schedule_email_campaigns()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url TEXT := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/email-campaign-send';
  v_headers  JSONB := public.get_internal_headers();
  v_now      TIMESTAMPTZ := NOW();
  v_campaign RECORD;
  v_triggered INT := 0;
BEGIN
  FOR v_campaign IN
    SELECT id
    FROM email_campaigns
    WHERE status = 'scheduled'
      AND scheduled_at <= v_now
    ORDER BY scheduled_at ASC
  LOOP
    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object('campaign_id', v_campaign.id),
      timeout_milliseconds := 90000
    );
    v_triggered := v_triggered + 1;
  END LOOP;

  RETURN jsonb_build_object('triggered', v_triggered);
END;
$$;

-- Rewire cron job #18
SELECT cron.unschedule('email-campaign-scheduler-every-3-min');
SELECT cron.schedule(
  'email-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $cmd$SELECT public.schedule_email_campaigns();$cmd$
);
