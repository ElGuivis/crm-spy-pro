-- RFM: a tela baixava o historico inteiro (~200 mil linhas) a cada abertura, esgotando o pool de
-- conexoes (PGRST003/504) e derrubando o calculo e a criacao de audiencias.
-- 1) indice por (integracao, data): as buscas "ultima data" e "linhas da data" nao tinham indice proprio
-- 2) agregacao no servidor para o grafico de evolucao

CREATE INDEX IF NOT EXISTS idx_rfm_integration_date
  ON public.customer_rfm_snapshots (integration_id, reference_date DESC);

CREATE OR REPLACE FUNCTION public.get_rfm_history(p_integration_id uuid)
RETURNS TABLE (reference_date date, segment_name text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.reference_date, COALESCE(s.segment_name, 'Outros') AS segment_name, count(*) AS total
  FROM public.customer_rfm_snapshots s
  WHERE s.integration_id = p_integration_id
  GROUP BY s.reference_date, COALESCE(s.segment_name, 'Outros')
  ORDER BY s.reference_date;
$$;

REVOKE ALL ON FUNCTION public.get_rfm_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rfm_history(uuid) TO authenticated, service_role;
