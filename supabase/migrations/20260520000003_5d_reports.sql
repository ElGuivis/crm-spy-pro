-- Phase 5D: Revenue attribution RPC
-- Joins email_events (opens/clicks) with customer_rfm_snapshots by email
-- Returns "influenced revenue" — the total LTV of customers who engaged with each campaign
CREATE OR REPLACE FUNCTION public.get_revenue_attribution(
  p_tenant_id UUID,
  p_lookback_days INT DEFAULT 90
)
RETURNS TABLE (
  campaign_id     UUID,
  campaign_name   TEXT,
  sent_count      BIGINT,
  opens           BIGINT,
  clicks          BIGINT,
  attributed_customers BIGINT,
  attributed_revenue   NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH engaged AS (
    SELECT DISTINCT
      ee.campaign_id,
      ee.recipient_email,
      MAX(CASE WHEN ee.event_type = 'open'  THEN 1 ELSE 0 END) AS had_open,
      MAX(CASE WHEN ee.event_type = 'click' THEN 1 ELSE 0 END) AS had_click
    FROM public.email_events ee
    WHERE ee.tenant_id = p_tenant_id
      AND ee.event_type IN ('open', 'click')
      AND ee.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
    GROUP BY ee.campaign_id, ee.recipient_email
  ),
  per_campaign AS (
    SELECT
      e.campaign_id,
      SUM(e.had_open)                            AS opens,
      SUM(e.had_click)                           AS clicks,
      COUNT(DISTINCT e.recipient_email)          AS unique_engaged,
      COALESCE(SUM(s.revenue_total), 0)          AS attributed_revenue
    FROM engaged e
    LEFT JOIN public.customer_rfm_snapshots s
      ON s.tenant_id = p_tenant_id
      AND LOWER(s.customer_email) = LOWER(e.recipient_email)
    GROUP BY e.campaign_id
  )
  SELECT
    ec.id                                AS campaign_id,
    ec.internal_name                     AS campaign_name,
    COALESCE(ec.total_sent, 0)::BIGINT    AS sent_count,
    COALESCE(pc.opens, 0)::BIGINT        AS opens,
    COALESCE(pc.clicks, 0)::BIGINT       AS clicks,
    COALESCE(pc.unique_engaged, 0)       AS attributed_customers,
    COALESCE(pc.attributed_revenue, 0)   AS attributed_revenue
  FROM public.email_campaigns ec
  LEFT JOIN per_campaign pc ON pc.campaign_id = ec.id
  WHERE ec.tenant_id = p_tenant_id
    AND ec.status = 'sent'
  ORDER BY COALESCE(pc.attributed_revenue, 0) DESC
  LIMIT 25;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_attribution(UUID, INT) TO authenticated;
