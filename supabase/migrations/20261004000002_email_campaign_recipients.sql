-- Lista de destinatarios de uma campanha por segmento (para exportar): todos, abriram, clicaram, compraram,
-- nao abriram, abriram e nao clicaram, descadastraram, com problema de entrega.
-- "Abriram" segue o mesmo criterio do painel (pixel de abertura); quem so clicou entra em "clicaram".
CREATE OR REPLACE FUNCTION public.get_email_campaign_recipients(
  p_tenant_id uuid,
  p_campaign_id uuid,
  p_segment text DEFAULT 'all'
)
RETURNS TABLE (
  email text, name text, sent_at timestamptz,
  opens bigint, first_open_at timestamptz, last_open_at timestamptz,
  clicks bigint, last_click_at timestamptz,
  orders bigint, revenue numeric,
  unsubscribed boolean, bounced boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT lower(btrim(l.recipient_email)) AS em,
           max(l.recipient_name) AS nm,
           min(l.sent_at) AS sent,
           bool_or(l.status IN ('failed', 'error', 'bounced')) AS failed
    FROM public.email_campaign_logs l
    WHERE public.caller_has_tenant(p_tenant_id)
      AND l.tenant_id = p_tenant_id AND l.campaign_id = p_campaign_id
      AND COALESCE(l.is_test, false) = false
      AND l.recipient_email IS NOT NULL AND btrim(l.recipient_email) <> ''
    GROUP BY 1
  ),
  ev AS (
    SELECT lower(btrim(e.recipient_email)) AS em,
           count(*) FILTER (WHERE e.event_type = 'open') AS opens,
           min(e.created_at) FILTER (WHERE e.event_type = 'open') AS first_open,
           max(e.created_at) FILTER (WHERE e.event_type = 'open') AS last_open,
           count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
           max(e.created_at) FILTER (WHERE e.event_type = 'click') AS last_click,
           bool_or(e.event_type = 'unsubscribe') AS unsub,
           bool_or(e.event_type IN ('bounce', 'complaint')) AS bnc
    FROM public.email_events e
    WHERE e.tenant_id = p_tenant_id AND e.campaign_id = p_campaign_id
    GROUP BY 1
  ),
  conv AS (
    SELECT lower(btrim(v.customer_email)) AS em, count(*) AS orders, sum(v.order_total) AS revenue
    FROM public.email_campaign_conversions v
    WHERE v.tenant_id = p_tenant_id AND v.campaign_id = p_campaign_id
    GROUP BY 1
  ),
  joined AS (
    SELECT b.em, b.nm, b.sent,
           COALESCE(ev.opens, 0) AS opens, ev.first_open, ev.last_open,
           COALESCE(ev.clicks, 0) AS clicks, ev.last_click,
           COALESCE(conv.orders, 0) AS orders, COALESCE(conv.revenue, 0) AS revenue,
           COALESCE(ev.unsub, false) AS unsub,
           (COALESCE(ev.bnc, false) OR b.failed) AS bounced
    FROM base b
    LEFT JOIN ev ON ev.em = b.em
    LEFT JOIN conv ON conv.em = b.em
  )
  SELECT j.em, j.nm, j.sent, j.opens, j.first_open, j.last_open, j.clicks, j.last_click,
         j.orders, j.revenue, j.unsub, j.bounced
  FROM joined j
  WHERE CASE p_segment
          WHEN 'all'                THEN NOT j.bounced
          WHEN 'opened'             THEN j.opens > 0
          WHEN 'clicked'            THEN j.clicks > 0
          WHEN 'purchased'          THEN j.orders > 0
          WHEN 'not_opened'         THEN j.opens = 0 AND NOT j.bounced
          WHEN 'opened_not_clicked' THEN j.opens > 0 AND j.clicks = 0
          WHEN 'unsubscribed'       THEN j.unsub
          WHEN 'bounced'            THEN j.bounced
          ELSE false
        END
  ORDER BY j.em;
$$;

REVOKE EXECUTE ON FUNCTION public.get_email_campaign_recipients(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_recipients(uuid, uuid, text) TO authenticated, service_role;
