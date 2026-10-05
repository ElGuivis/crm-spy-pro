-- Paineis cruzados (Fase N6): (1) o que uma pessoa recebeu e usou, em um so lugar; (2) retorno por finalidade das mensagens (envios x cupons usados x receita).

-- (1) Comunicacao de uma pessoa: supressao, newsletter, ultimos envios (registro unico de contatos), campanhas de e-mail e cupons.
CREATE OR REPLACE FUNCTION public.get_customer_communication(p_tenant_id uuid, p_email text, p_phone text DEFAULT NULL, p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_key_email text := CASE WHEN position('@' IN v_email) > 1 THEN v_email END;
  v_key_phone text := public.customer_key(NULL, p_phone);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_out jsonb;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'suppression', (SELECT to_jsonb(x) FROM (
        SELECT s.reason, s.source, s.created_at FROM public.email_suppression_list s
        WHERE s.tenant_id = p_tenant_id AND lower(s.email) = v_key_email ORDER BY s.created_at DESC LIMIT 1) x),
    'phone_blocked', EXISTS (SELECT 1 FROM public.contact_blocks b WHERE b.tenant_id = p_tenant_id AND v_key_phone IS NOT NULL AND regexp_replace(b.phone_e164, '\D', '', 'g') = v_key_phone),
    'newsletter', (SELECT to_jsonb(x) FROM (
        SELECT n.is_baseline, n.first_seen_at, n.removed_at IS NOT NULL AS removed FROM public.li_newsletter_subscribers n
        WHERE n.tenant_id = p_tenant_id AND lower(n.email) = v_key_email ORDER BY n.first_seen_at DESC LIMIT 1) x),
    'touches', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT t.purpose, t.channel, t.module_ref, t.sent_at FROM public.customer_touches t
        WHERE t.tenant_id = p_tenant_id AND ((v_key_email IS NOT NULL AND t.email = v_key_email) OR (v_key_phone IS NOT NULL AND t.phone = v_key_phone))
        ORDER BY t.sent_at DESC LIMIT v_limit) x), '[]'::jsonb),
    'campaigns', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT c.internal_name AS campaign_name, c.subject, c.flow_kind, l.status, l.sent_at FROM public.email_campaign_logs l
        JOIN public.email_campaigns c ON c.id = l.campaign_id
        WHERE l.tenant_id = p_tenant_id AND v_key_email IS NOT NULL AND lower(l.recipient_email) = v_key_email AND COALESCE(l.is_test, false) = false
        ORDER BY l.sent_at DESC NULLS LAST LIMIT v_limit) x), '[]'::jsonb),
    'coupons', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT g.coupon_code, g.origin_type, g.created_at, g.expires_at, g.used_at, g.used_order_value
        FROM public.generated_coupons g
        WHERE g.tenant_id = p_tenant_id AND g.issue_status IS DISTINCT FROM 'pending'
          AND ((v_key_email IS NOT NULL AND lower(g.customer_email) = v_key_email) OR (v_key_phone IS NOT NULL AND public.customer_key(NULL, g.customer_phone) = v_key_phone))
        ORDER BY g.created_at DESC LIMIT v_limit) x), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_customer_communication(uuid, text, text, integer) TO authenticated;

-- (2) Retorno por finalidade: envios (registro unico de contatos) x cupons emitidos/usados/receita da mesma origem, nos ultimos N dias
CREATE OR REPLACE FUNCTION public.get_message_performance(p_tenant_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (purpose text, touches integer, people integer, email_touches integer, whatsapp_touches integer, coupons_issued integer, coupons_redeemed integer, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH t AS (
    SELECT x.purpose, count(*)::int AS touches, count(DISTINCT COALESCE(x.email, x.phone))::int AS people,
           count(*) FILTER (WHERE x.channel = 'email')::int AS email_touches, count(*) FILTER (WHERE x.channel = 'whatsapp')::int AS whatsapp_touches
    FROM public.customer_touches x
    WHERE x.tenant_id = p_tenant_id AND x.sent_at >= now() - make_interval(days => p_days)
    GROUP BY x.purpose
  ), c AS (
    -- origem do cupom -> finalidade do envio que o entrega
    SELECT CASE g.origin_type WHEN 'email_campaign' THEN 'campaign' ELSE g.origin_type END AS purpose,
           count(*)::int AS issued, count(g.used_at)::int AS redeemed, COALESCE(sum(g.used_order_value) FILTER (WHERE g.used_at IS NOT NULL), 0) AS revenue
    FROM public.generated_coupons g
    WHERE g.tenant_id = p_tenant_id AND g.issue_status IS DISTINCT FROM 'pending' AND g.created_at >= now() - make_interval(days => p_days)
      AND g.origin_type IN ('email_campaign', 'recovery', 'welcome', 'cashback', 'birthday', 'reactivation')
    GROUP BY 1
  )
  SELECT COALESCE(t.purpose, c.purpose), COALESCE(t.touches, 0), COALESCE(t.people, 0), COALESCE(t.email_touches, 0), COALESCE(t.whatsapp_touches, 0),
         COALESCE(c.issued, 0), COALESCE(c.redeemed, 0), COALESCE(c.revenue, 0)
  FROM t FULL JOIN c ON c.purpose = t.purpose
  ORDER BY 2 DESC, 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_message_performance(uuid, integer) TO authenticated;
