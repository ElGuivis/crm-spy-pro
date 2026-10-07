-- Campanha Anti-Churn: usar só o snapshot MAIS RECENTE de cada pessoa.
-- Antes, a contagem da tela e a função diária (process_churn_campaigns) liam customer_rfm_snapshots de
-- TODAS as datas: a mesma pessoa entrava 1x por dia de histórico (14.526 "em risco" para 4.876 clientes),
-- clientes de snapshots antigos entravam e a mesma mensagem podia sair repetida. Também havia dois
-- SELECT ... LIMIT 500 sem ORDER BY (a campanha e o registro de disparos podiam divergir).

CREATE OR REPLACE FUNCTION public.churn_at_risk_customers(p_tenant_id uuid, p_threshold numeric)
RETURNS TABLE (
  customer_id text, customer_name text, customer_email text, customer_phone text,
  churn_probability numeric, revenue_total numeric
)
LANGUAGE sql STABLE SET search_path = public, pg_catalog
AS $$
  -- 1 linha por pessoa (snapshot mais recente) e depois 1 por telefone: pessoas com e-mails diferentes
  -- mas o mesmo telefone receberiam a mensagem duas vezes
  SELECT DISTINCT ON (regexp_replace(s.customer_phone, '\D', '', 'g'))
         s.customer_id, s.customer_name, s.customer_email, s.customer_phone, s.churn_probability, s.revenue_total
  FROM (
    SELECT DISTINCT ON (customer_key(customer_email, customer_phone))
           customer_id, customer_name, customer_email, customer_phone, churn_probability, revenue_total
    FROM public.customer_rfm_snapshots
    WHERE tenant_id = p_tenant_id
      AND customer_key(customer_email, customer_phone) IS NOT NULL
    ORDER BY customer_key(customer_email, customer_phone), reference_date DESC, created_at DESC
  ) s
  WHERE s.churn_probability >= p_threshold
    AND s.customer_phone IS NOT NULL
    AND length(regexp_replace(s.customer_phone, '\D', '', 'g')) >= 10
  ORDER BY regexp_replace(s.customer_phone, '\D', '', 'g'), s.churn_probability DESC, s.revenue_total DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.churn_at_risk_customers(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.churn_at_risk_customers(uuid, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_churn_campaigns()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cfg           RECORD;
  cutoff_ts     TIMESTAMPTZ;
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

    -- elegíveis: 1 linha por pessoa (snapshot mais recente), fora do período de espera, congelados numa
    -- tabela temporária para que a campanha e o registro de disparos usem exatamente a mesma lista
    DROP TABLE IF EXISTS _churn_eligible;
    CREATE TEMP TABLE _churn_eligible ON COMMIT DROP AS
      SELECT e.*
      FROM public.churn_at_risk_customers(cfg.tenant_id, cfg.churn_threshold) e
      WHERE NOT EXISTS (
        SELECT 1 FROM public.churn_campaign_triggers t
        WHERE t.config_id = cfg.id
          AND t.triggered_at >= cutoff_ts
          AND customer_key(t.customer_email, t.customer_phone) = customer_key(e.customer_email, e.customer_phone)
      )
      ORDER BY e.churn_probability DESC, e.revenue_total DESC NULLS LAST
      LIMIT 500;

    SELECT COUNT(*) INTO eligible_cnt FROM _churn_eligible;
    CONTINUE WHEN eligible_cnt = 0;

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

      INSERT INTO public.campaign_contacts (campaign_id, tenant_id, name, phone, variables, status)
      SELECT
        campaign_id, cfg.tenant_id, customer_name,
        REGEXP_REPLACE(COALESCE(customer_phone, ''), '\D', '', 'g'),
        JSONB_BUILD_OBJECT(
          'nome',          COALESCE(customer_name, ''),
          'primeiro_nome', SPLIT_PART(COALESCE(customer_name, ''), ' ', 1),
          'email',         COALESCE(customer_email, '')
        ),
        'pending'
      FROM _churn_eligible;

      GET DIAGNOSTICS inserted_cnt = ROW_COUNT;
      UPDATE public.bulk_campaigns SET total_contacts = inserted_cnt WHERE id = campaign_id;

      INSERT INTO public.churn_campaign_triggers
        (tenant_id, config_id, customer_id, customer_name, customer_email, customer_phone, churn_probability, channel)
      SELECT cfg.tenant_id, cfg.id, customer_id, customer_name, customer_email, customer_phone,
             churn_probability, cfg.channel
      FROM _churn_eligible;

      UPDATE public.churn_campaign_configs SET last_run_at = NOW(), updated_at = NOW() WHERE id = cfg.id;
    END IF;
  END LOOP;
END;
$function$;

-- Contagem para a tela (mesma regra da função acima)
CREATE OR REPLACE FUNCTION public.churn_at_risk_count(p_threshold numeric)
RETURNS bigint
LANGUAGE sql STABLE SET search_path = public, pg_catalog
AS $$
  SELECT count(*) FROM public.churn_at_risk_customers((SELECT public.get_user_tenant_id(auth.uid())), p_threshold);
$$;

REVOKE ALL ON FUNCTION public.churn_at_risk_count(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.churn_at_risk_count(numeric) TO authenticated, service_role;
