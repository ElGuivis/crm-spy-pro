-- Google Ads Manager: agregacoes para o motor de descobertas (security_invoker => respeitam o RLS do usuario).
--  * google_ads_geo_totals: regioes somadas entre campanhas.
--  * google_ads_term_split(conta, termos_da_marca): quanto do gasto/receita das buscas vem de termos da marca x demais.
--  * google_ads_term_zero(conta, gasto_minimo): termos com gasto e nenhuma conversao na vida (candidatos a negativar).

CREATE OR REPLACE VIEW public.google_ads_geo_totals WITH (security_invoker = true) AS
SELECT tenant_id, account_id, region_key, max(region_name) AS region_name,
       sum(impressions)::bigint AS impressions, sum(clicks)::bigint AS clicks, sum(cost_micros)::bigint AS cost_micros,
       sum(conversions) AS conversions, sum(conversions_value) AS conversions_value
FROM public.google_ads_geo_stats
GROUP BY tenant_id, account_id, region_key;

CREATE OR REPLACE FUNCTION public.google_ads_term_split(p_account uuid, p_brand_terms text[])
RETURNS TABLE (
  total_cost bigint, total_value numeric, total_conversions numeric,
  brand_cost bigint, brand_value numeric, brand_conversions numeric,
  zero_conv_cost bigint, zero_conv_terms bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (
    SELECT search_term, sum(cost_micros) AS cost, sum(conversions_value) AS val, sum(conversions) AS conv
    FROM public.google_ads_search_terms WHERE account_id = p_account GROUP BY search_term
  ), flagged AS (
    SELECT *, (cardinality(coalesce(p_brand_terms, '{}')) > 0 AND EXISTS (
      SELECT 1 FROM unnest(p_brand_terms) b WHERE length(b) >= 2 AND t.search_term ILIKE '%' || b || '%')) AS is_brand
    FROM t
  )
  SELECT coalesce(sum(cost), 0)::bigint, coalesce(sum(val), 0), coalesce(sum(conv), 0),
         coalesce(sum(cost) FILTER (WHERE is_brand), 0)::bigint, coalesce(sum(val) FILTER (WHERE is_brand), 0),
         coalesce(sum(conv) FILTER (WHERE is_brand), 0),
         coalesce(sum(cost) FILTER (WHERE conv = 0), 0)::bigint, count(*) FILTER (WHERE conv = 0 AND cost > 0)
  FROM flagged;
$$;

CREATE OR REPLACE FUNCTION public.google_ads_term_zero(p_account uuid, p_min_cost_micros bigint, p_limit integer DEFAULT 30)
RETURNS TABLE (search_term text, cost_micros bigint, clicks bigint, impressions bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT search_term, sum(cost_micros)::bigint, sum(clicks)::bigint, sum(impressions)::bigint
  FROM public.google_ads_search_terms WHERE account_id = p_account
  GROUP BY search_term
  HAVING sum(conversions) = 0 AND sum(cost_micros) >= p_min_cost_micros
  ORDER BY sum(cost_micros) DESC
  LIMIT least(greatest(p_limit, 1), 200);
$$;

REVOKE ALL ON public.google_ads_geo_totals FROM anon, authenticated;
GRANT SELECT ON public.google_ads_geo_totals TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.google_ads_term_split(uuid, text[]), public.google_ads_term_zero(uuid, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.google_ads_term_split(uuid, text[]), public.google_ads_term_zero(uuid, bigint, integer) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_gads_search_terms_term ON public.google_ads_search_terms (account_id, search_term);
NOTIFY pgrst, 'reload schema';
