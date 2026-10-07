-- Busca de produtos: no modo 'any' ordena primeiro por quantos termos casam (depois estoque),
-- para "camiseta oversized" trazer as oversized no topo e nao so as de maior estoque.

CREATE OR REPLACE FUNCTION public.search_available_products(
  p_tenant uuid, p_terms text[], p_mode text DEFAULT 'all', p_limit integer DEFAULT 20
)
RETURNS TABLE (name text, price numeric, promotional_price numeric, stock integer)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.name, p.price, p.promotional_price, p.stock
  FROM public.li_products p
  WHERE p.tenant_id = p_tenant AND p.active AND p.stock > 0
    AND (
      coalesce(array_length(p_terms, 1), 0) = 0
      OR (p_mode = 'any' AND public.immutable_unaccent(lower(p.name)) LIKE ANY (
            ARRAY(SELECT '%' || public.immutable_unaccent(lower(t)) || '%' FROM unnest(p_terms) t)))
      OR (p_mode <> 'any' AND public.immutable_unaccent(lower(p.name)) LIKE ALL (
            ARRAY(SELECT '%' || public.immutable_unaccent(lower(t)) || '%' FROM unnest(p_terms) t)))
    )
  ORDER BY
    (SELECT count(*) FROM unnest(coalesce(p_terms, ARRAY[]::text[])) t
      WHERE public.immutable_unaccent(lower(p.name)) LIKE '%' || public.immutable_unaccent(lower(t)) || '%') DESC,
    p.stock DESC, p.name
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

REVOKE ALL ON FUNCTION public.search_available_products(uuid, text[], text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_available_products(uuid, text[], text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
