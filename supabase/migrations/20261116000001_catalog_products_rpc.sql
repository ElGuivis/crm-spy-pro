-- Catalogo WhatsApp (pagina e envio pelo atendimento): produtos da Loja Integrada ja agrupados no banco.
-- 16/11/2026: o front lia li_products inteiro e o PostgREST corta em 1000 linhas (PGRST_DB_MAX_ROWS):
-- de 4.620 linhas ativas chegava uma fatia qualquer, e produtos 'normal' eram descartados.
-- Uma linha por produto: pai com grade (variacoes ativas COM estoque em `variants`), produto simples/normal
-- e variacao orfa (sem pai cadastrado). `on_site` = o produto aparece na loja (pai ativo); pai inativo so
-- entra se ainda tiver variacao com estoque (a tela mostra "fora do site" apenas quando o usuario pede).
-- SECURITY INVOKER: a RLS de li_products (tenant do usuario) vale normalmente.
CREATE OR REPLACE FUNCTION public.get_catalog_products(p_integration_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  stock numeric,
  on_site boolean,
  sku text,
  image_url text,
  imagem_principal jsonb,
  imagens jsonb,
  created_at timestamp,
  variants jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.image_url, p.active, p.loja_integrada_product_id,
           COALESCE(p.raw_json->>'tipo', 'normal') AS tipo,
           substring(p.raw_json->>'pai' FROM '(\d+)$')::bigint AS pai_id,
           COALESCE(NULLIF(p.promotional_price, 0), p.price) AS eff_price,
           GREATEST(COALESCE((p.raw_json->>'estoque_quantidade')::numeric, p.stock, 0), 0) AS qty,
           p.raw_json->'imagem_principal' AS imagem_principal,
           p.raw_json->'imagens' AS imagens,
           NULLIF(p.raw_json->>'data_criacao', '')::timestamp AS created_at
      FROM public.li_products p
     WHERE p.integration_id = p_integration_id
  ),
  kids AS (
    SELECT k.pai_id,
           jsonb_agg(jsonb_build_object('name', k.name, 'stock', k.qty, 'price', k.eff_price) ORDER BY k.name) AS variants,
           sum(k.qty) AS stock,
           min(k.eff_price) AS min_price
      FROM base k
     WHERE k.tipo = 'atributo_opcao' AND k.active AND k.qty > 0
     GROUP BY k.pai_id
  ),
  parents AS (
    SELECT b.id, b.name, COALESCE(b.eff_price, k.min_price) AS price,
           CASE WHEN b.tipo = 'atributo' THEN COALESCE(k.stock, 0) ELSE b.qty END AS stock,
           b.active AS on_site, b.sku, b.image_url, b.imagem_principal, b.imagens, b.created_at,
           COALESCE(k.variants, '[]'::jsonb) AS variants
      FROM base b
      LEFT JOIN kids k ON b.tipo = 'atributo' AND k.pai_id = b.loja_integrada_product_id
     WHERE b.tipo <> 'atributo_opcao'
       AND (b.active OR (b.tipo = 'atributo' AND k.stock > 0) OR (b.tipo <> 'atributo' AND b.qty > 0))
  ),
  orphans AS (
    SELECT b.id, b.name, b.eff_price, b.qty, true, b.sku, b.image_url, b.imagem_principal, b.imagens, b.created_at, '[]'::jsonb
      FROM base b
     WHERE b.tipo = 'atributo_opcao' AND b.active AND b.qty > 0
       AND NOT EXISTS (SELECT 1 FROM base p WHERE p.tipo <> 'atributo_opcao' AND p.loja_integrada_product_id = b.pai_id)
  )
  SELECT * FROM parents
  UNION ALL
  SELECT * FROM orphans;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_catalog_products(uuid) TO authenticated, service_role;
