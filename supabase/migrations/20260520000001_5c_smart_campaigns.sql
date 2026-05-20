-- ============================================================
-- Fase 5C: Campanhas Inteligentes
-- A/B testing (email + WA bulk), melhor horário, anti-churn
-- ============================================================

-- A/B test em email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS ab_test_id    UUID    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_variant    TEXT    DEFAULT NULL,  -- 'A' | 'B'
  ADD COLUMN IF NOT EXISTS ab_split_pct  INTEGER DEFAULT 50,   -- % de A (B recebe 100 - X%)
  ADD COLUMN IF NOT EXISTS ab_offset_pct INTEGER DEFAULT 0;    -- offset no array ordenado por email

-- A/B test em bulk_campaigns (split dos contatos ocorre na criação)
ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS ab_test_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_variant  TEXT DEFAULT NULL;  -- 'A' | 'B'

-- ------------------------------------------------------------
-- RPC: melhor horário de envio baseado em email_events
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_best_send_hours(p_tenant_id UUID)
RETURNS TABLE(hour_of_day INTEGER, open_count BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER,
    COUNT(*)
  FROM public.email_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'open'
    AND created_at >= NOW() - INTERVAL '90 days'
  GROUP BY 1
  ORDER BY COUNT(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_best_send_days(p_tenant_id UUID)
RETURNS TABLE(day_of_week INTEGER, open_count BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT
    EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER,
    COUNT(*)
  FROM public.email_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'open'
    AND created_at >= NOW() - INTERVAL '90 days'
  GROUP BY 1
  ORDER BY COUNT(*) DESC;
$$;

-- ------------------------------------------------------------
-- Configuração de campanhas anti-churn
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.churn_campaign_configs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL DEFAULT 'Campanha Anti-Churn',
  is_active                BOOLEAN NOT NULL DEFAULT false,
  churn_threshold          NUMERIC NOT NULL DEFAULT 0.7,
  channel                  TEXT NOT NULL DEFAULT 'whatsapp',  -- 'whatsapp' | 'email'
  -- WhatsApp
  whatsapp_integration_id  UUID REFERENCES public.integrations(id),
  whatsapp_message         TEXT,
  -- Email
  email_subject            TEXT,
  email_body               TEXT,
  -- Cooldown: não disparar para o mesmo cliente antes de X dias
  cooldown_days            INTEGER NOT NULL DEFAULT 30,
  last_run_at              TIMESTAMP WITH TIME ZONE,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.churn_campaign_triggers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  config_id           UUID NOT NULL REFERENCES public.churn_campaign_configs(id) ON DELETE CASCADE,
  customer_id         TEXT,
  customer_email      TEXT,
  customer_phone      TEXT,
  customer_name       TEXT,
  churn_probability   NUMERIC,
  channel             TEXT,
  triggered_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.churn_campaign_configs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churn_campaign_triggers  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "churn_configs_tenant" ON public.churn_campaign_configs
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "churn_configs_tenant_insert" ON public.churn_campaign_configs
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "churn_configs_tenant_update" ON public.churn_campaign_configs
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "churn_triggers_tenant" ON public.churn_campaign_triggers
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_email_campaigns_ab_test_id ON public.email_campaigns(ab_test_id) WHERE ab_test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_ab_test_id  ON public.bulk_campaigns(ab_test_id) WHERE ab_test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_churn_triggers_config_customer ON public.churn_campaign_triggers(config_id, customer_id, triggered_at);

-- Realtime para churn_campaign_configs (frontend polling)
ALTER PUBLICATION supabase_realtime ADD TABLE public.churn_campaign_configs;

-- ------------------------------------------------------------
-- Função Postgres: processa as campanhas anti-churn
-- Roda inteiramente no DB — sem edge function nova.
-- Cria bulk_campaign com status='scheduled' e scheduled_at=NOW()
-- para o bulk-campaign-scheduler existente (cron a cada minuto) disparar.
-- ------------------------------------------------------------
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

    IF cfg.channel = 'whatsapp' AND cfg.whatsapp_integration_id IS NOT NULL THEN
      -- Cria campanha bulk (status=scheduled + scheduled_at=NOW() para o
      -- bulk-campaign-scheduler existente pegar no próximo tick de 1 minuto)
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

      -- Insere contatos elegíveis
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

      -- Registra log de disparo
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

-- Cron: executa process_churn_campaigns() diariamente às 8h Brasília (11h UTC)
SELECT cron.schedule(
  'churn-campaign-trigger',
  '0 11 * * *',
  'SELECT public.process_churn_campaigns()'
);
