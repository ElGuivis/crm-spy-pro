-- Nomes das variacoes de grade da Loja Integrada (Tamanho/Cor/Genero) para o catalogo WhatsApp.
-- 16/11/2026: 77 das 460 variacoes com estoque vinham como "Sem nome" (li_products.name) e so traziam
-- raw_json.variacoes = ["/api/v1/grade/<grade>/variacao/<id>"]. A API devolve os nomes em /v1/grades
-- (nome_visivel da grade) e /v1/grade/<grade>/variacao (nome do valor). O job "grades" do li-marketing-jobs
-- (cron diario) busca so os ids em uso que ainda faltam aqui.
CREATE TABLE IF NOT EXISTS public.li_grade_variations (
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  variation_id bigint NOT NULL,
  grade_id bigint NOT NULL,
  grade_name text NOT NULL,
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, variation_id)
);

ALTER TABLE public.li_grade_variations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS li_grade_variations_select ON public.li_grade_variations;
CREATE POLICY li_grade_variations_select ON public.li_grade_variations
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
REVOKE ALL ON public.li_grade_variations FROM anon;
GRANT SELECT ON public.li_grade_variations TO authenticated;
GRANT ALL ON public.li_grade_variations TO service_role;

-- Catalogo: cada variacao sai com os atributos nomeados ({"Tamanho":"GG","Cor":"Preto"}) e as fotos ja como
-- lista de URLs (a resposta caiu de ~1,2 MB com o JSON de imagens para poucas centenas de KB).
DROP FUNCTION IF EXISTS public.get_catalog_products(uuid);
CREATE FUNCTION public.get_catalog_products(p_integration_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  stock numeric,
  on_site boolean,
  sku text,
  images text[],
  created_at timestamp,
  variants jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.image_url, p.active, p.loja_integrada_product_id, p.raw_json,
           COALESCE(p.raw_json->>'tipo', 'normal') AS tipo,
           substring(p.raw_json->>'pai' FROM '(\d+)$')::bigint AS pai_id,
           COALESCE(NULLIF(p.promotional_price, 0), p.price) AS eff_price,
           GREATEST(COALESCE((p.raw_json->>'estoque_quantidade')::numeric, p.stock, 0), 0) AS qty,
           NULLIF(p.raw_json->>'data_criacao', '')::timestamp AS created_at
      FROM public.li_products p
     WHERE p.integration_id = p_integration_id
  ),
  kid_rows AS (
    SELECT k.pai_id, k.name, k.qty, k.eff_price,
           (SELECT jsonb_object_agg(g.grade_name, g.name)
              FROM jsonb_array_elements_text(COALESCE(k.raw_json->'variacoes', '[]'::jsonb)) v
              JOIN public.li_grade_variations g
                ON g.integration_id = p_integration_id
               AND g.variation_id = substring(v FROM '(\d+)$')::bigint) AS attrs
      FROM base k
     WHERE k.tipo = 'atributo_opcao' AND k.active AND k.qty > 0
  ),
  kids AS (
    SELECT pai_id,
           jsonb_agg(jsonb_build_object('name', name, 'attrs', COALESCE(attrs, '{}'::jsonb), 'stock', qty, 'price', eff_price) ORDER BY name) AS variants,
           sum(qty) AS stock,
           min(eff_price) AS min_price
      FROM kid_rows
     GROUP BY pai_id
  ),
  pics AS (
    -- igual a liImageList do front: principal (original pelo caminho) e as demais na ordem da loja, sem repetir, ate 10
    SELECT b.id,
           (SELECT array_agg(u ORDER BY ord) FROM (
              SELECT DISTINCT ON (u) u, ord FROM (
                SELECT 0 AS ord,
                       CASE WHEN b.raw_json->'imagem_principal'->>'caminho' IS NOT NULL
                            THEN 'https://cdn.awsli.com.br/' || (b.raw_json->'imagem_principal'->>'caminho')
                            ELSE regexp_replace(COALESCE(b.raw_json->'imagem_principal'->>'grande', b.image_url), '^(https?://cdn\.awsli\.com\.br)/\d+x\d+/', '\1/', 'i')
                       END AS u
                UNION ALL
                SELECT 1 + COALESCE((im->>'posicao')::int, 0),
                       CASE WHEN im->>'caminho' IS NOT NULL THEN 'https://cdn.awsli.com.br/' || (im->>'caminho')
                            ELSE regexp_replace(im->>'grande', '^(https?://cdn\.awsli\.com\.br)/\d+x\d+/', '\1/', 'i') END
                  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.raw_json->'imagens') = 'array' THEN b.raw_json->'imagens' ELSE '[]'::jsonb END) im
              ) x WHERE u IS NOT NULL ORDER BY u, ord
            ) y) AS images
      FROM base b
     WHERE b.tipo <> 'atributo_opcao' OR (b.active AND b.qty > 0)
  ),
  parents AS (
    SELECT b.id, b.name, COALESCE(b.eff_price, k.min_price) AS price,
           CASE WHEN b.tipo = 'atributo' THEN COALESCE(k.stock, 0) ELSE b.qty END AS stock,
           b.active AS on_site, b.sku, pc.images[1:10], b.created_at,
           COALESCE(k.variants, '[]'::jsonb) AS variants
      FROM base b
      LEFT JOIN kids k ON b.tipo = 'atributo' AND k.pai_id = b.loja_integrada_product_id
      LEFT JOIN pics pc ON pc.id = b.id
     WHERE b.tipo <> 'atributo_opcao'
       AND (b.active OR (b.tipo = 'atributo' AND k.stock > 0) OR (b.tipo <> 'atributo' AND b.qty > 0))
  ),
  orphans AS (
    SELECT b.id, b.name, b.eff_price, b.qty, true, b.sku, pc.images[1:10], b.created_at, '[]'::jsonb
      FROM base b
      LEFT JOIN pics pc ON pc.id = b.id
     WHERE b.tipo = 'atributo_opcao' AND b.active AND b.qty > 0
       AND NOT EXISTS (SELECT 1 FROM base p WHERE p.tipo <> 'atributo_opcao' AND p.loja_integrada_product_id = b.pai_id)
  )
  SELECT * FROM parents
  UNION ALL
  SELECT * FROM orphans;
$$;

REVOKE EXECUTE ON FUNCTION public.get_catalog_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_catalog_products(uuid) TO authenticated, service_role;

-- Ids de variacao em uso (produtos ativos ou com estoque) que ainda nao tem nome: o job "grades" busca so esses.
CREATE OR REPLACE FUNCTION public.get_missing_li_grade_variations(p_integration_id uuid)
RETURNS TABLE (grade_id bigint, variation_id bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT substring(v FROM 'grade/(\d+)/')::bigint, substring(v FROM '(\d+)$')::bigint
    FROM public.li_products p, jsonb_array_elements_text(COALESCE(p.raw_json->'variacoes', '[]'::jsonb)) v
   WHERE p.integration_id = p_integration_id
     AND (p.active OR COALESCE((p.raw_json->>'estoque_quantidade')::numeric, 0) > 0)
     AND v ~ 'grade/\d+/variacao/\d+$'
     AND NOT EXISTS (SELECT 1 FROM public.li_grade_variations g
                      WHERE g.integration_id = p_integration_id AND g.variation_id = substring(v FROM '(\d+)$')::bigint);
$$;
REVOKE EXECUTE ON FUNCTION public.get_missing_li_grade_variations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_missing_li_grade_variations(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'li-grades-sync') THEN
    PERFORM cron.schedule('li-grades-sync', '20 6 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/li-marketing-jobs',
                           headers := public.get_internal_headers(), body := '{"job":"grades"}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END
$$;
