-- Top termos de pesquisa agregados (vida inteira) para a tela. p_order: cost | revenue | waste (gasto sem conversao).
CREATE OR REPLACE FUNCTION public.google_ads_term_top(p_account uuid, p_order text DEFAULT 'cost', p_limit integer DEFAULT 50)
RETURNS TABLE (search_term text, impressions bigint, clicks bigint, cost_micros bigint, conversions numeric, conversions_value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t.search_term, sum(t.impressions)::bigint, sum(t.clicks)::bigint, sum(t.cost_micros)::bigint, sum(t.conversions), sum(t.conversions_value)
  FROM public.google_ads_search_terms t WHERE t.account_id = p_account
  GROUP BY t.search_term
  HAVING p_order <> 'waste' OR sum(t.conversions) = 0
  ORDER BY CASE WHEN p_order = 'revenue' THEN sum(t.conversions_value) ELSE sum(t.cost_micros) END DESC
  LIMIT least(greatest(p_limit, 1), 200);
$$;
REVOKE ALL ON FUNCTION public.google_ads_term_top(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.google_ads_term_top(uuid, text, integer) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
