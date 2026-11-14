-- RFM incremental (E3/E4-banco): as tabelas de snapshot passam a guardar so a situacao ATUAL
-- (1 linha por cliente). O historico mora em rfm_history_daily / rfm_segment_changes.
-- Backup antes: /opt/backups/rfm_snapshots_pre_refactor_20261114.sql.gz

-- 1) fica so a data mais recente de cada integracao
DELETE FROM public.customer_rfm_snapshots s
USING (SELECT integration_id, max(reference_date) AS d FROM public.customer_rfm_snapshots GROUP BY integration_id) m
WHERE s.integration_id = m.integration_id AND s.reference_date < m.d;

DELETE FROM public.customer_rfm_category_snapshots s
USING (SELECT integration_id, max(reference_date) AS d FROM public.customer_rfm_category_snapshots GROUP BY integration_id) m
WHERE s.integration_id = m.integration_id AND s.reference_date < m.d;

-- 2) uma linha por cliente (alvo do upsert); o id fica estavel
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfm_snapshot_customer
  ON public.customer_rfm_snapshots (integration_id, customer_id);
DROP INDEX IF EXISTS public.idx_rfm_integration_customer_date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rfm_category_snapshot_customer
  ON public.customer_rfm_category_snapshots (integration_id, customer_id, category_name);

-- 3) recalculo de audiencia no servidor (uma chamada, sem laco de 500 em 500 no navegador)
CREATE OR REPLACE FUNCTION public.rfm_refresh_audience(p_audience_id uuid)
RETURNS TABLE (member_count integer, total_revenue numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a public.rfm_audiences%ROWTYPE;
  r jsonb;
  v_count integer;
  v_rev numeric;
BEGIN
  SELECT * INTO a FROM public.rfm_audiences WHERE id = p_audience_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audiencia nao encontrada'; END IF;
  r := COALESCE(a.rules, '{}'::jsonb);

  DELETE FROM public.rfm_audience_members WHERE audience_id = a.id;

  INSERT INTO public.rfm_audience_members (audience_id, snapshot_id, tenant_id)
  SELECT a.id, s.id, a.tenant_id
  FROM public.customer_rfm_snapshots s
  WHERE s.integration_id = a.integration_id
    AND s.reference_date = (SELECT max(x.reference_date) FROM public.customer_rfm_snapshots x WHERE x.integration_id = a.integration_id)
    AND (r->>'r_min' IS NULL OR s.r_score >= (r->>'r_min')::int)
    AND (r->>'r_max' IS NULL OR s.r_score <= (r->>'r_max')::int)
    AND (r->>'f_min' IS NULL OR s.f_score >= (r->>'f_min')::int)
    AND (r->>'f_max' IS NULL OR s.f_score <= (r->>'f_max')::int)
    AND (r->>'m_min' IS NULL OR s.m_score >= (r->>'m_min')::int)
    AND (r->>'m_max' IS NULL OR s.m_score <= (r->>'m_max')::int)
    AND (r->>'segment_name' IS NULL OR s.segment_name = r->>'segment_name')
    AND (r->>'churn_risk' IS NULL OR s.churn_risk = r->>'churn_risk')
    AND (r->>'min_revenue' IS NULL OR s.revenue_total >= (r->>'min_revenue')::numeric)
    AND (r->>'max_revenue' IS NULL OR s.revenue_total <= (r->>'max_revenue')::numeric)
    AND (r->>'min_orders' IS NULL OR s.orders_count >= (r->>'min_orders')::int)
    AND (r->>'max_orders' IS NULL OR s.orders_count <= (r->>'max_orders')::int)
    AND (r->>'min_aov' IS NULL OR s.aov >= (r->>'min_aov')::numeric)
    AND (r->>'max_aov' IS NULL OR s.aov <= (r->>'max_aov')::numeric);

  SELECT count(*), COALESCE(sum(s.revenue_total), 0) INTO v_count, v_rev
  FROM public.rfm_audience_members m JOIN public.customer_rfm_snapshots s ON s.id = m.snapshot_id
  WHERE m.audience_id = a.id;

  UPDATE public.rfm_audiences
     SET member_count = v_count, total_revenue = v_rev, last_calculated_at = now()
   WHERE id = a.id;

  RETURN QUERY SELECT v_count, v_rev;
END;
$$;
REVOKE ALL ON FUNCTION public.rfm_refresh_audience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rfm_refresh_audience(uuid) TO authenticated, service_role;
