-- Etapas de fluxo criadas e nunca usadas (ex.: "Criar etapas padrao" clicado varias vezes, ou fluxo nao salvo): arquiva as campanhas
-- de fluxo que nenhum fluxo referencia, nunca enviaram nada e tem mais de 1 dia. Arquivar (nao apagar) preserva qualquer historico.
CREATE OR REPLACE FUNCTION public.archive_orphan_flow_campaigns()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.email_campaigns c SET is_archived = true
  WHERE c.flow_kind IS NOT NULL AND NOT c.is_archived AND COALESCE(c.total_sent, 0) = 0 AND c.created_at < now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.abandonment_flows f, jsonb_array_elements(f.steps) s
      WHERE f.tenant_id = c.tenant_id AND s->'email'->>'campaign_id' = c.id::text
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.archive_orphan_flow_campaigns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_orphan_flow_campaigns() TO service_role;
