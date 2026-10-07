-- Produto disponivel = variacao ativa, com estoque, NAO bloqueada e com o produto PAI ativo e nao bloqueado.
-- Antes so a variacao era checada: os 1.849 pais estao inativos na Loja Integrada, entao nada e vendavel,
-- mas 213 variacoes aparecem como "ativas com estoque" e a IA oferecia o que nao esta a venda.
-- O pai de uma variacao e identificado por raw_json->>'pai' = '/api/v1/produto/<loja_integrada_product_id>'.

CREATE OR REPLACE FUNCTION public.search_available_products(
  p_tenant uuid, p_terms text[], p_mode text DEFAULT 'all', p_limit integer DEFAULT 20
)
RETURNS TABLE (name text, price numeric, promotional_price numeric, stock integer)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.name, p.price, p.promotional_price, p.stock
  FROM public.li_products p
  LEFT JOIN public.li_products par
    ON par.tenant_id = p.tenant_id
   AND par.integration_id = p.integration_id
   AND ('/api/v1/produto/' || par.loja_integrada_product_id) = p.raw_json->>'pai'
  WHERE p.tenant_id = p_tenant AND p.active AND p.stock > 0
    AND coalesce((p.raw_json->>'bloqueado')::boolean, false) = false
    AND (
      (p.raw_json->>'pai' IS NULL)
      OR (par.id IS NOT NULL AND par.active AND coalesce((par.raw_json->>'bloqueado')::boolean, false) = false)
    )
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
