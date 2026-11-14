-- RFM incremental (E1): historico leve que substitui o acumulo de fotos diarias.
--  rfm_history_daily   : contagem por segmento por dia (grafico de evolucao e alertas)
--  rfm_segment_changes : quem mudou de segmento e quando (tela de migracao)

CREATE TABLE IF NOT EXISTS public.rfm_history_daily (
  tenant_id       uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id  uuid    NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  reference_date  date    NOT NULL,
  segment_name    text    NOT NULL,
  customers       integer NOT NULL DEFAULT 0,
  repeat_customers integer NOT NULL DEFAULT 0,   -- orders_count > 1
  revenue         numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (integration_id, reference_date, segment_name)
);
CREATE INDEX IF NOT EXISTS idx_rfm_history_daily_tenant ON public.rfm_history_daily (tenant_id);

CREATE TABLE IF NOT EXISTS public.rfm_segment_changes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id  uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  customer_id     text NOT NULL,
  from_segment    text NOT NULL,
  to_segment      text NOT NULL,
  revenue_total   numeric NOT NULL DEFAULT 0,
  changed_on      date NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rfm_segment_changes_int_date ON public.rfm_segment_changes (integration_id, changed_on DESC);
CREATE INDEX IF NOT EXISTS idx_rfm_segment_changes_tenant ON public.rfm_segment_changes (tenant_id);

ALTER TABLE public.rfm_history_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfm_segment_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfm_history_daily_select ON public.rfm_history_daily;
CREATE POLICY rfm_history_daily_select ON public.rfm_history_daily FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));
DROP POLICY IF EXISTS rfm_history_daily_service ON public.rfm_history_daily;
CREATE POLICY rfm_history_daily_service ON public.rfm_history_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rfm_segment_changes_select ON public.rfm_segment_changes;
CREATE POLICY rfm_segment_changes_select ON public.rfm_segment_changes FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));
DROP POLICY IF EXISTS rfm_segment_changes_service ON public.rfm_segment_changes;
CREATE POLICY rfm_segment_changes_service ON public.rfm_segment_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Preenche o passado a partir das fotos diarias existentes (idempotente)
INSERT INTO public.rfm_history_daily (tenant_id, integration_id, reference_date, segment_name, customers, repeat_customers, revenue)
SELECT tenant_id, integration_id, reference_date, COALESCE(segment_name, 'Outros'),
       count(*), count(*) FILTER (WHERE COALESCE(orders_count, 0) > 1), COALESCE(sum(revenue_total), 0)
FROM public.customer_rfm_snapshots
GROUP BY tenant_id, integration_id, reference_date, COALESCE(segment_name, 'Outros')
ON CONFLICT (integration_id, reference_date, segment_name) DO NOTHING;

INSERT INTO public.rfm_segment_changes (tenant_id, integration_id, customer_id, from_segment, to_segment, revenue_total, changed_on)
SELECT tenant_id, integration_id, customer_id, prev_seg, seg, revenue_total, reference_date
FROM (
  SELECT tenant_id, integration_id, customer_id, reference_date, revenue_total,
         COALESCE(segment_name, 'Outros') AS seg,
         LAG(COALESCE(segment_name, 'Outros')) OVER (PARTITION BY integration_id, customer_id ORDER BY reference_date) AS prev_seg
  FROM public.customer_rfm_snapshots
) t
WHERE prev_seg IS NOT NULL AND prev_seg <> seg
  AND NOT EXISTS (SELECT 1 FROM public.rfm_segment_changes);

-- Grafico de evolucao passa a ler o historico leve
CREATE OR REPLACE FUNCTION public.get_rfm_history(p_integration_id uuid)
RETURNS TABLE (reference_date date, segment_name text, total bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT h.reference_date, h.segment_name, h.customers::bigint
  FROM public.rfm_history_daily h
  WHERE h.integration_id = p_integration_id
  ORDER BY h.reference_date;
$$;
REVOKE ALL ON FUNCTION public.get_rfm_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rfm_history(uuid) TO authenticated, service_role;
