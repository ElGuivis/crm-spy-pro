-- Fix process_churn_campaigns: cap at 500, fix total_contacts, guard whatsapp_message null
CREATE OR REPLACE FUNCTION public.process_churn_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cfg           RECORD;
  cutoff_ts     TIMESTAMPTZ;
  excluded_ids  TEXT[];
  campaign_id   UUID;
  eligible_cnt  INTEGER;
  inserted_cnt  INTEGER;
BEGIN
  FOR cfg IN
    SELECT id, tenant_id, churn_threshold, channel,
           whatsapp_integration_id, whatsapp_message, cooldown_days
    FROM public.churn_campaign_configs
    WHERE is_active = true
  LOOP
    cutoff_ts := NOW() - (cfg.cooldown_days || ' days')::INTERVAL;

    SELECT ARRAY_AGG(customer_id) INTO excluded_ids
    FROM public.churn_campaign_triggers
    WHERE config_id = cfg.id
      AND triggered_at >= cutoff_ts;

    SELECT COUNT(*) INTO eligible_cnt
    FROM public.customer_rfm_snapshots
    WHERE tenant_id        = cfg.tenant_id
      AND churn_probability >= cfg.churn_threshold
      AND customer_phone IS NOT NULL
      AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids));

    CONTINUE WHEN eligible_cnt = 0;

    -- Cap at 500 contacts per run to avoid overloading
    eligible_cnt := LEAST(eligible_cnt, 500);

    IF cfg.channel = 'whatsapp'
       AND cfg.whatsapp_integration_id IS NOT NULL
       AND cfg.whatsapp_message IS NOT NULL
    THEN
      INSERT INTO public.bulk_campaigns (
        tenant_id, name, message_template, whatsapp_integration_id,
        delay_seconds, delay_max_seconds, total_contacts, tokens_per_message,
        status, scheduled_at
      ) VALUES (
        cfg.tenant_id,
        'Anti-Churn ' || TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
        cfg.whatsapp_message,
        cfg.whatsapp_integration_id,
        120, 360,
        eligible_cnt, 2,
        'scheduled', NOW()
      ) RETURNING id INTO campaign_id;

      INSERT INTO public.campaign_contacts
        (campaign_id, tenant_id, name, phone, variables, status)
      SELECT
        campaign_id,
        cfg.tenant_id,
        customer_name,
        REGEXP_REPLACE(COALESCE(customer_phone, ''), '\D', '', 'g'),
        JSONB_BUILD_OBJECT(
          'nome',          COALESCE(customer_name, ''),
          'primeiro_nome', SPLIT_PART(COALESCE(customer_name, ''), ' ', 1),
          'email',         COALESCE(customer_email, '')
        ),
        'pending'
      FROM public.customer_rfm_snapshots
      WHERE tenant_id        = cfg.tenant_id
        AND churn_probability >= cfg.churn_threshold
        AND customer_phone IS NOT NULL
        AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids))
      LIMIT 500;

      -- Fix total_contacts to reflect actual rows inserted
      GET DIAGNOSTICS inserted_cnt = ROW_COUNT;
      UPDATE public.bulk_campaigns
      SET total_contacts = inserted_cnt
      WHERE id = campaign_id;

      INSERT INTO public.churn_campaign_triggers
        (tenant_id, config_id, customer_id, customer_name, customer_email, customer_phone, churn_probability, channel)
      SELECT
        cfg.tenant_id, cfg.id,
        customer_id, customer_name, customer_email, customer_phone,
        churn_probability, cfg.channel
      FROM public.customer_rfm_snapshots
      WHERE tenant_id        = cfg.tenant_id
        AND churn_probability >= cfg.churn_threshold
        AND customer_phone IS NOT NULL
        AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids))
      LIMIT 500;

      UPDATE public.churn_campaign_configs
      SET last_run_at = NOW(), updated_at = NOW()
      WHERE id = cfg.id;
    END IF;
  END LOOP;
END;
$$;
