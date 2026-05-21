-- Migrate instagram-metrics-rollup edge fn → Postgres function (free 1 slot)
-- Precedent: process_churn_campaigns() / cron #30

CREATE OR REPLACE FUNCTION public.rollup_instagram_metrics(
  p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start  TIMESTAMPTZ := p_date::TIMESTAMPTZ;
  v_end    TIMESTAMPTZ := (p_date + 1)::TIMESTAMPTZ;
  v_ch     RECORD;
  v_rolled INT := 0;
BEGIN
  FOR v_ch IN
    SELECT id, tenant_id
    FROM instagram_channels
    WHERE status IN ('connected', 'expiring')
  LOOP
    INSERT INTO instagram_metrics_daily (
      tenant_id, channel_id, metric_date,
      inbound_messages, outbound_messages, new_threads,
      private_replies_sent, flows_started, flows_completed,
      handoffs_to_human, comment_triggers, story_reply_triggers,
      story_mention_triggers, live_comment_triggers, ad_entry_triggers,
      ref_url_entries, send_failures, emails_captured, phones_captured,
      cta_clicks, updated_at
    )
    SELECT
      v_ch.tenant_id,
      v_ch.id,
      p_date,
      -- messages (join via threads)
      (SELECT COUNT(*) FILTER (WHERE direction = 'inbound')
       FROM instagram_messages
       WHERE thread_id IN (SELECT id FROM instagram_threads WHERE channel_id = v_ch.id)
         AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE direction = 'outbound')
       FROM instagram_messages
       WHERE thread_id IN (SELECT id FROM instagram_threads WHERE channel_id = v_ch.id)
         AND created_at >= v_start AND created_at < v_end),
      -- new threads
      (SELECT COUNT(*) FROM instagram_threads
       WHERE channel_id = v_ch.id
         AND created_at >= v_start AND created_at < v_end),
      -- events (single scan, conditional aggregation)
      (SELECT COUNT(*) FILTER (WHERE event_type = 'private_reply_sent')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'flow_started')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'flow_completed')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'handoff_to_human')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'comment_trigger')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'story_reply_trigger')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'story_mention_trigger')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'live_comment_trigger')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'ad_entry_trigger')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FILTER (WHERE event_type = 'ref_url_entry')
       FROM instagram_event_log
       WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end),
      -- outbox failures
      (SELECT COUNT(*) FROM instagram_outbox
       WHERE channel_id = v_ch.id AND status = 'dead'
         AND created_at >= v_start AND created_at < v_end),
      -- data captures
      (SELECT COUNT(*) FROM instagram_data_collection_events
       WHERE channel_id = v_ch.id AND field_name = 'email'
         AND created_at >= v_start AND created_at < v_end),
      (SELECT COUNT(*) FROM instagram_data_collection_events
       WHERE channel_id = v_ch.id AND field_name = 'phone'
         AND created_at >= v_start AND created_at < v_end),
      -- cta clicks (filtered by tenant_id, not channel_id)
      (SELECT COUNT(*) FROM instagram_cta_link_clicks
       WHERE tenant_id = v_ch.tenant_id
         AND clicked_at >= v_start AND clicked_at < v_end),
      NOW()
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

-- Rewire cron job: drop old + recreate pointing to Postgres function
-- (preserves same schedule, no jobid hardcoding needed)
SELECT cron.unschedule('instagram-metrics-rollup-hourly');
SELECT cron.schedule(
  'instagram-metrics-rollup-hourly',
  '0 * * * *',
  $cmd$SELECT public.rollup_instagram_metrics();$cmd$
);
