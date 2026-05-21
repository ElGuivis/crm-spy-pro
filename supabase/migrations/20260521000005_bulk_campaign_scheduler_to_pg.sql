-- Migrate bulk-campaign-scheduler edge fn → Postgres function (free 1 slot)
-- Replicates: scheduled→processing transition + sending window check + pending count + HTTP dispatch.

CREATE OR REPLACE FUNCTION public.schedule_bulk_campaigns()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url   TEXT := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bulk-campaign-processor';
  v_headers    JSONB := public.get_internal_headers();
  v_now        TIMESTAMPTZ := NOW();
  v_campaign   RECORD;
  v_started    INT := 0;
  v_dow        INT;
  v_local_time TIME;
  v_window     JSONB;
  v_pending    BIGINT;
BEGIN
  FOR v_campaign IN
    SELECT id, name, status, scheduled_at, sending_schedule, timezone,
           next_send_at, processing_lock_until
    FROM bulk_campaigns
    WHERE status IN ('scheduled', 'processing')
      AND (next_send_at IS NULL OR next_send_at <= v_now)
      AND (processing_lock_until IS NULL OR processing_lock_until < v_now)
    ORDER BY created_at ASC
  LOOP
    -- Transition scheduled → processing once scheduled_at has arrived
    IF v_campaign.status = 'scheduled' THEN
      IF v_campaign.scheduled_at IS NULL OR v_campaign.scheduled_at > v_now THEN
        CONTINUE;
      END IF;
      UPDATE bulk_campaigns
      SET status = 'processing', started_at = v_now
      WHERE id = v_campaign.id;
    END IF;

    -- Check sending window (day-of-week + time range in campaign's timezone)
    IF v_campaign.sending_schedule IS NOT NULL
       AND v_campaign.sending_schedule <> 'null'::JSONB
       AND v_campaign.sending_schedule <> '{}'::JSONB THEN

      v_dow := EXTRACT(
        DOW FROM (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))
      )::INT;
      v_local_time := (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))::TIME;
      v_window := v_campaign.sending_schedule -> v_dow::TEXT;

      IF v_window IS NULL THEN
        CONTINUE; -- No window configured for today
      END IF;

      IF NOT (v_local_time >= (v_window->>'start')::TIME
              AND v_local_time < (v_window->>'end')::TIME) THEN
        CONTINUE; -- Outside configured window
      END IF;
    END IF;

    -- Skip if no pending contacts
    SELECT COUNT(*) INTO v_pending
    FROM campaign_contacts
    WHERE campaign_id = v_campaign.id AND status = 'pending';

    IF v_pending = 0 THEN CONTINUE; END IF;

    -- Fire processor asynchronously
    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object('campaign_id', v_campaign.id),
      timeout_milliseconds := 90000
    );
    v_started := v_started + 1;
  END LOOP;

  RETURN jsonb_build_object('started', v_started);
END;
$$;

-- Rewire cron job #11
SELECT cron.unschedule('bulk-campaign-scheduler-every-3-min');
SELECT cron.schedule(
  'bulk-campaign-scheduler-every-3-min',
  '*/3 * * * *',
  $cmd$SELECT public.schedule_bulk_campaigns();$cmd$
);
