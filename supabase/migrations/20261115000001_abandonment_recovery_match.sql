-- Recuperação de abandono: a compra que tira a pessoa do fluxo passa a ser reconhecida por
-- e-mail OU id do cliente na loja OU celular (antes só e-mail: cliente que comprou com outro e-mail
-- ou carrinho só com telefone seguia recebendo as etapas 2 e 3).
-- O processador chama esta função a cada minuto, antes de qualquer envio.
CREATE OR REPLACE FUNCTION public.refresh_abandonment_recovery()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  WITH hit AS (
    SELECT a.id AS a_id, a.tenant_id, o.id AS order_id, o.order_number, o.created_at_remote AS ordered_at,
           lower(btrim(o.raw_json->'cliente'->>'email')) AS email,
           COALESCE(public.try_numeric(o.totals_json->>'total'), 0) AS total,
           (SELECT s.flow_campaign_id FROM public.abandonment_flow_sends s
             WHERE s.abandonment_id = a.id AND s.channel = 'email' AND s.status = 'sent' AND s.sent_at <= o.created_at_remote
             ORDER BY s.sent_at DESC LIMIT 1) AS flow_campaign_id,
           EXISTS (SELECT 1 FROM public.abandonment_flow_sends s
             WHERE s.abandonment_id = a.id AND s.status = 'sent' AND s.sent_at <= o.created_at_remote) AS ours
    FROM public.li_abandonment_campaigns a
    CROSS JOIN LATERAL (
      SELECT o.*
      FROM public.li_orders o
      WHERE o.tenant_id = a.tenant_id
        AND o.created_at_remote >= a.event_at
        AND o.created_at_remote <= a.event_at + interval '7 days'
        AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
        AND (
             (a.recipient_email IS NOT NULL AND lower(btrim(o.raw_json->'cliente'->>'email')) = lower(btrim(a.recipient_email)))
          OR (a.client_id IS NOT NULL AND o.raw_json->'cliente'->>'id' = a.client_id::text)
          OR (a.recipient_phone IS NOT NULL
              AND public.customer_key(NULL, a.recipient_phone) IS NOT NULL
              AND public.customer_key(NULL, COALESCE(o.raw_json->'cliente'->>'telefone_celular', o.raw_json->'cliente'->>'telefone_principal'))
                  = public.customer_key(NULL, a.recipient_phone))
        )
      ORDER BY o.created_at_remote
      LIMIT 1
    ) o
    WHERE a.flow_status IN ('open', 'done', 'expired') AND a.event_at IS NOT NULL
      AND a.event_at >= now() - interval '30 days'
      AND (a.recipient_email IS NOT NULL OR a.client_id IS NOT NULL OR a.recipient_phone IS NOT NULL)
  ), upd AS (
    UPDATE public.li_abandonment_campaigns a
    SET flow_status = 'recovered', recovered_at = h.ordered_at, recovered_order_id = h.order_id, recovered_total = h.total,
        recovered_via = CASE WHEN h.ours THEN 'ours' ELSE 'other' END
    FROM hit h WHERE a.id = h.a_id
    RETURNING a.id
  ), conv AS (
    INSERT INTO public.email_campaign_conversions
      (tenant_id, campaign_id, platform, order_id, order_number, customer_email, order_total, ordered_at, attribution_type, touch_at)
    SELECT h.tenant_id, h.flow_campaign_id, 'loja_integrada', h.order_id, h.order_number, h.email, h.total, h.ordered_at, 'recovery', h.ordered_at
    FROM hit h WHERE h.ours AND h.flow_campaign_id IS NOT NULL
    ON CONFLICT (tenant_id, platform, order_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;
