-- =============================================================================
-- FASE 4 (Email Marketing): logs por destinatário, tokens de descadastro/tracking,
-- tags por cliente (li_customers) e estimativa real de audiência elegível.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Email campaign logs: adicionar colunas de log por destinatário
-- -----------------------------------------------------------------------------
ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_campaign_id ON public.email_campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_tenant_campaign ON public.email_campaign_logs(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_recipient_email ON public.email_campaign_logs(tenant_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_event_type ON public.email_campaign_logs(tenant_id, event_type);

-- -----------------------------------------------------------------------------
-- 2) Tokens por destinatário (unsubscribe + open/click tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  UNIQUE (campaign_id, recipient_email)
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- Tenant isolation (somente membros autenticados do tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_select'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_select"
    ON public.email_unsubscribe_tokens
    FOR SELECT
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_insert'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_insert"
    ON public.email_unsubscribe_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_update'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_update"
    ON public.email_unsubscribe_tokens
    FOR UPDATE
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()))
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_tenant_campaign ON public.email_unsubscribe_tokens(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_recipient_email ON public.email_unsubscribe_tokens(tenant_id, recipient_email);

-- -----------------------------------------------------------------------------
-- 3) Tags por cliente (li_customers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_tags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.li_customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'customer_tags' AND policyname = 'customer_tags_tenant_all'
  ) THEN
    CREATE POLICY "customer_tags_tenant_all"
    ON public.customer_tags
    FOR ALL
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()))
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_id ON public.customer_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag_id ON public.customer_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_customer_id ON public.customer_tags(customer_id);

-- -----------------------------------------------------------------------------
-- 4) RPC de estimativa de audiência (sem simular) - retorna total, suprimidos e elegíveis
--    Formato de _audience_reference esperado:
--    - {"emails": ["a@b.com"...]} (manual)
--    - {"segment_id": "uuid"} (segment)
--    - {"filters": {"integration_id": "uuid", "tag_ids": ["uuid"...], "name_contains": "...", "email_contains": "...", "phone_contains": "...", "doc_contains": "...", "updated_from": "2026-01-01T00:00:00Z", "updated_to": "..." }}
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estimate_email_audience(
  _audience_type text,
  _audience_reference jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _ref jsonb := COALESCE(_audience_reference, '{}'::jsonb);
  _filters jsonb := COALESCE(_audience_reference->'filters', '{}'::jsonb);
  _integration_id uuid;
  _tag_ids uuid[];
  _name_contains text;
  _email_contains text;
  _phone_contains text;
  _doc_contains text;
  _updated_from timestamptz;
  _updated_to timestamptz;
  _emails text[];
  _total int := 0;
  _suppressed int := 0;
BEGIN
  _tenant_id := public.get_user_tenant_id(auth.uid());
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Segmento salvo -> carrega filtros
  IF _audience_type = 'segment' THEN
    _seg_id := NULLIF(_ref->>'segment_id', '')::uuid;
    IF _seg_id IS NULL THEN
      RAISE EXCEPTION 'segment_id is required';
    END IF;

    SELECT filters INTO _filters
    FROM public.crm_segments
    WHERE id = _seg_id AND tenant_id = _tenant_id;

    IF _filters IS NULL THEN
      RAISE EXCEPTION 'segment not found';
    END IF;
  END IF;

  -- Manual list
  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
    INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));

    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email
      FROM unnest(_emails) e
      WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt
      FROM candidates c
      JOIN public.email_suppression_list s
        ON s.tenant_id = _tenant_id
       AND lower(s.email) = c.email
       AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT
      (SELECT count(*)::int FROM candidates),
      (SELECT cnt FROM suppressed)
    INTO _total, _suppressed;

    RETURN jsonb_build_object(
      'total_with_email', _total,
      'suppressed', _suppressed,
      'eligible', GREATEST(_total - _suppressed, 0)
    );
  END IF;

  -- Filters (all/filters/segment)
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;

  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO _tag_ids
    FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE
    _tag_ids := NULL;
  END IF;

  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email
    FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id
      AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (
        _tag_ids IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.customer_tags ct
          WHERE ct.tenant_id = _tenant_id
            AND ct.customer_id = c.id
            AND ct.tag_id = ANY(_tag_ids)
        )
      )
  ), suppressed AS (
    SELECT count(*)::int AS cnt
    FROM candidates cand
    JOIN public.email_suppression_list s
      ON s.tenant_id = _tenant_id
     AND lower(s.email) = cand.email
     AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT
    (SELECT count(*)::int FROM candidates),
    (SELECT cnt FROM suppressed)
  INTO _total, _suppressed;

  RETURN jsonb_build_object(
    'total_with_email', _total,
    'suppressed', _suppressed,
    'eligible', GREATEST(_total - _suppressed, 0)
  );
END;
$$;