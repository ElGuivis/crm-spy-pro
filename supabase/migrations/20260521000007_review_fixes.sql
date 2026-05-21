-- Fix 1: rollup_instagram_metrics — collapse redundant table scans
--   Before: 9 separate subqueries on instagram_event_log (same predicate, different FILTER)
--           2 separate subqueries on instagram_messages (same thread_id subquery each)
--           2 separate subqueries on instagram_data_collection_events
--   After:  1 scan per table using conditional aggregation + JOIN for messages

CREATE OR REPLACE FUNCTION public.rollup_instagram_metrics(
  p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start         TIMESTAMPTZ := p_date::TIMESTAMPTZ;
  v_end           TIMESTAMPTZ := (p_date + 1)::TIMESTAMPTZ;
  v_ch            RECORD;
  v_rolled        INT := 0;
  v_inbound       BIGINT;
  v_outbound      BIGINT;
  v_new_threads   BIGINT;
  v_priv_reply    BIGINT;
  v_flow_start    BIGINT;
  v_flow_complete BIGINT;
  v_handoff       BIGINT;
  v_comment_trg   BIGINT;
  v_story_reply   BIGINT;
  v_story_mention BIGINT;
  v_live_comment  BIGINT;
  v_ad_entry      BIGINT;
  v_ref_url       BIGINT;
  v_failures      BIGINT;
  v_emails        BIGINT;
  v_phones        BIGINT;
  v_cta           BIGINT;
BEGIN
  FOR v_ch IN
    SELECT id, tenant_id FROM instagram_channels WHERE status IN ('connected', 'expiring')
  LOOP
    -- messages: single JOIN scan (was two correlated subqueries re-running the same thread lookup)
    SELECT
      COUNT(*) FILTER (WHERE m.direction = 'inbound'),
      COUNT(*) FILTER (WHERE m.direction = 'outbound')
    INTO v_inbound, v_outbound
    FROM instagram_messages m
    JOIN instagram_threads t ON t.id = m.thread_id
    WHERE t.channel_id = v_ch.id
      AND m.created_at >= v_start AND m.created_at < v_end;

    SELECT COUNT(*) INTO v_new_threads
    FROM instagram_threads
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    -- events: single scan (was 9 separate scans with identical WHERE predicate)
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'private_reply_sent'),
      COUNT(*) FILTER (WHERE event_type = 'flow_started'),
      COUNT(*) FILTER (WHERE event_type = 'flow_completed'),
      COUNT(*) FILTER (WHERE event_type = 'handoff_to_human'),
      COUNT(*) FILTER (WHERE event_type = 'comment_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'story_reply_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'story_mention_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'live_comment_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'ad_entry_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'ref_url_entry')
    INTO
      v_priv_reply, v_flow_start, v_flow_complete, v_handoff,
      v_comment_trg, v_story_reply, v_story_mention, v_live_comment,
      v_ad_entry, v_ref_url
    FROM instagram_event_log
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    SELECT COUNT(*) INTO v_failures
    FROM instagram_outbox
    WHERE channel_id = v_ch.id AND status = 'dead'
      AND created_at >= v_start AND created_at < v_end;

    -- captures: single scan (was two separate subqueries)
    SELECT
      COUNT(*) FILTER (WHERE field_name = 'email'),
      COUNT(*) FILTER (WHERE field_name = 'phone')
    INTO v_emails, v_phones
    FROM instagram_data_collection_events
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    -- cta clicks: table has no channel_id — intentionally scoped to tenant
    SELECT COUNT(*) INTO v_cta
    FROM instagram_cta_link_clicks
    WHERE tenant_id = v_ch.tenant_id AND clicked_at >= v_start AND clicked_at < v_end;

    INSERT INTO instagram_metrics_daily (
      tenant_id, channel_id, metric_date,
      inbound_messages, outbound_messages, new_threads,
      private_replies_sent, flows_started, flows_completed,
      handoffs_to_human, comment_triggers, story_reply_triggers,
      story_mention_triggers, live_comment_triggers, ad_entry_triggers,
      ref_url_entries, send_failures, emails_captured, phones_captured,
      cta_clicks, updated_at
    ) VALUES (
      v_ch.tenant_id, v_ch.id, p_date,
      v_inbound, v_outbound, v_new_threads,
      v_priv_reply, v_flow_start, v_flow_complete,
      v_handoff, v_comment_trg, v_story_reply,
      v_story_mention, v_live_comment, v_ad_entry,
      v_ref_url, v_failures, v_emails, v_phones,
      v_cta, NOW()
    )
    ON CONFLICT (channel_id, metric_date) DO UPDATE SET
      inbound_messages       = EXCLUDED.inbound_messages,
      outbound_messages      = EXCLUDED.outbound_messages,
      new_threads            = EXCLUDED.new_threads,
      private_replies_sent   = EXCLUDED.private_replies_sent,
      flows_started          = EXCLUDED.flows_started,
      flows_completed        = EXCLUDED.flows_completed,
      handoffs_to_human      = EXCLUDED.handoffs_to_human,
      comment_triggers       = EXCLUDED.comment_triggers,
      story_reply_triggers   = EXCLUDED.story_reply_triggers,
      story_mention_triggers = EXCLUDED.story_mention_triggers,
      live_comment_triggers  = EXCLUDED.live_comment_triggers,
      ad_entry_triggers      = EXCLUDED.ad_entry_triggers,
      ref_url_entries        = EXCLUDED.ref_url_entries,
      send_failures          = EXCLUDED.send_failures,
      emails_captured        = EXCLUDED.emails_captured,
      phones_captured        = EXCLUDED.phones_captured,
      cta_clicks             = EXCLUDED.cta_clicks,
      updated_at             = EXCLUDED.updated_at;

    v_rolled := v_rolled + 1;
  END LOOP;

  RETURN jsonb_build_object('rolled_up', v_rolled, 'date', p_date);
END;
$$;

-- Fix 2: schedule_bulk_campaigns — remove unused 'name' from SELECT
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
    SELECT id, status, scheduled_at, sending_schedule, timezone,
           next_send_at, processing_lock_until
    FROM bulk_campaigns
    WHERE status IN ('scheduled', 'processing')
      AND (next_send_at IS NULL OR next_send_at <= v_now)
      AND (processing_lock_until IS NULL OR processing_lock_until < v_now)
    ORDER BY created_at ASC
  LOOP
    IF v_campaign.status = 'scheduled' THEN
      IF v_campaign.scheduled_at IS NULL OR v_campaign.scheduled_at > v_now THEN
        CONTINUE;
      END IF;
      UPDATE bulk_campaigns
      SET status = 'processing', started_at = v_now
      WHERE id = v_campaign.id;
    END IF;

    IF v_campaign.sending_schedule IS NOT NULL
       AND v_campaign.sending_schedule <> 'null'::JSONB
       AND v_campaign.sending_schedule <> '{}'::JSONB THEN

      v_dow := EXTRACT(
        DOW FROM (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))
      )::INT;
      v_local_time := (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))::TIME;
      v_window := v_campaign.sending_schedule -> v_dow::TEXT;

      IF v_window IS NULL THEN CONTINUE; END IF;
      IF NOT (v_local_time >= (v_window->>'start')::TIME
              AND v_local_time < (v_window->>'end')::TIME) THEN CONTINUE; END IF;
    END IF;

    SELECT COUNT(*) INTO v_pending
    FROM campaign_contacts
    WHERE campaign_id = v_campaign.id AND status = 'pending';

    IF v_pending = 0 THEN CONTINUE; END IF;

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
