-- Migracao entre segmentos a partir de rfm_segment_changes (ultimos N dias), sem comparar fotos inteiras
CREATE OR REPLACE FUNCTION public.get_rfm_migration(p_integration_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (from_segment text, to_segment text, customers bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT c.from_segment, c.to_segment, count(*)::bigint, COALESCE(sum(c.revenue_total), 0)
  FROM public.rfm_segment_changes c
  WHERE c.integration_id = p_integration_id
    AND c.changed_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - p_days
  GROUP BY c.from_segment, c.to_segment
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_rfm_migration(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rfm_migration(uuid, integer) TO authenticated, service_role;
