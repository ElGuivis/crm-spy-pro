-- Vitrine e seletor de produtos do editor de e-mail: so produto principal ATIVO na loja.
-- A premissa da 20261004000003 ("o pai vem com ativo=false na API") estava errada: o pai com ativo=false
-- esta escondido na loja e a pagina dele da 404, mesmo com variacoes ativas (15/11/2026: e-mail de teste
-- de boas-vindas levou para "camiseta-chronic-quebre-a-corrente-branco" -> pagina nao encontrada).
-- Conferido: 135 pais ativos -> 200; amostra de inativos -> 404. get_li_showcase_products usa esta funcao.
CREATE OR REPLACE FUNCTION public.get_li_parent_products()
RETURNS TABLE (
  id uuid, name text, sku text, price numeric, promotional_price numeric,
  image_url text, image_path text, image_large text, url text, variant_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, p.sku, p.price, p.promotional_price, p.image_url,
         p.raw_json->'imagem_principal'->>'caminho',
         p.raw_json->'imagem_principal'->>'grande',
         p.raw_json->>'url',
         count(c.id)
  FROM public.li_products p
  LEFT JOIN public.li_products c
    ON c.tenant_id = p.tenant_id
   AND c.raw_json->>'tipo' = 'atributo_opcao'
   AND c.active
   AND c.raw_json->>'pai' = '/api/v1/produto/' || p.loja_integrada_product_id
  WHERE p.raw_json->>'tipo' IN ('atributo', 'normal')
    AND COALESCE((p.raw_json->>'removido')::boolean, false) = false
    AND COALESCE((p.raw_json->>'ativo')::boolean, p.active, false)
  GROUP BY p.id
  HAVING count(c.id) > 0 OR p.raw_json->>'tipo' = 'normal'
  ORDER BY p.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_li_parent_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_li_parent_products() TO authenticated, service_role;
