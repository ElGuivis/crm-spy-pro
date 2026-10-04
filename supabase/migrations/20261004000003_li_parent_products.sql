-- Produtos "pai" da Loja Integrada para o seletor do editor de e-mail.
-- Na LI cada tamanho/cor e um produto proprio (tipo 'atributo_opcao', com `pai` apontando para o produto
-- principal). Para o e-mail interessa o produto principal ('atributo' ou 'normal'), que na API vem com
-- ativo=false; vale o pai que nao foi removido e tem ao menos uma variacao ativa.
-- SECURITY INVOKER: respeita o RLS de li_products (cada empresa so ve os proprios produtos).
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
  GROUP BY p.id
  HAVING count(c.id) > 0 OR (p.raw_json->>'tipo' = 'normal' AND p.active)
  ORDER BY p.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_li_parent_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_li_parent_products() TO authenticated, service_role;
