CREATE OR REPLACE FUNCTION public.estimate_email_audience(_audience_type text, _audience_reference jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _rfm_audience_id uuid;
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

  IF _audience_type = 'rfm' THEN
    _rfm_audience_id := NULLIF(_ref->>'rfm_audience_id', '')::uuid;
    IF _rfm_audience_id IS NULL THEN
      RAISE EXCEPTION 'rfm_audience_id is required';
    END IF;
    WITH rfm_emails AS (
      SELECT DISTINCT lower(trim(COALESCE(s.customer_email, s.customer_data->>'email'))) AS email
      FROM public.rfm_audience_members am
      JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
      WHERE am.audience_id = _rfm_audience_id AND am.tenant_id = _tenant_id
        AND (s.customer_email IS NOT NULL OR s.customer_data->>'email' IS NOT NULL)
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM rfm_emails e
      JOIN public.email_suppression_list sl ON sl.tenant_id = _tenant_id AND lower(sl.email) = e.email
        AND sl.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM rfm_emails WHERE email IS NOT NULL AND email <> ''),
           (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));
    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email FROM unnest(_emails) e WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM candidates c
      JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = c.email
        AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  -- all / filters / custom / segment all use filter-based resolution
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;
  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO _tag_ids FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE _tag_ids := NULL; END IF;
  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (_tag_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.customer_tags ct WHERE ct.tenant_id = _tenant_id AND ct.customer_id = c.id AND ct.tag_id = ANY(_tag_ids)
      ))
    UNION
    SELECT DISTINCT lower(bc.email) AS email FROM public.bling_customers bc
    WHERE bc.tenant_id = _tenant_id AND bc.email IS NOT NULL
      AND (_integration_id IS NULL OR bc.integration_id = _integration_id)
      AND (_name_contains IS NULL OR bc.nome ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR bc.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR bc.celular ILIKE '%' || _phone_contains || '%' OR bc.telefone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR bc.cpf_cnpj ILIKE '%' || _doc_contains || '%')
  ), suppressed AS (
    SELECT count(*)::int AS cnt FROM candidates cand
    JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = cand.email
      AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;

  RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
END;
$function$