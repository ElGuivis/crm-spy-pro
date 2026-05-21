-- Migrate rfm-cron-trigger edge fn → Postgres function (free 1 slot)
-- Dispatches rfm-calculator HTTP calls for each connected store integration.

CREATE OR REPLACE FUNCTION public.trigger_rfm_calculations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url TEXT := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/rfm-calculator';
  v_headers  JSONB := public.get_internal_headers();
  v_int      RECORD;
  v_count    INT := 0;
BEGIN
  FOR v_int IN
    SELECT id,
           CASE WHEN type = 'bling_v3' THEN 'bling' ELSE 'loja_integrada' END AS source_type
    FROM integrations
    WHERE type IN ('loja_integrada', 'bling_v3')
      AND status = 'connected'
  LOOP
    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object(
                   'integration_id', v_int.id,
                   'source_type',    v_int.source_type
                 ),
      timeout_milliseconds := 90000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_count);
END;
$$;

-- Rewire cron job #7 to call Postgres function directly
SELECT cron.unschedule('rfm-daily-calculation');
SELECT cron.schedule(
  'rfm-daily-calculation',
  '0 7 * * *',
  $cmd$SELECT public.trigger_rfm_calculations();$cmd$
);
