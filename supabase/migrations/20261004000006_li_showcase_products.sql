-- Vitrine automatica do editor de e-mail: produtos "pai" da Loja Integrada por criterio.
--   bestsellers: mais vendidos nos ultimos p_days dias (soma das quantidades dos itens dos pedidos, variacoes contam no pai)
--   newest:      cadastrados mais recentemente
--   promo:       com preco promocional menor que o preco cheio
-- Pedidos cancelados/devolvidos (status 7, 8, 16, 1020) nao contam. SECURITY INVOKER: respeita o RLS (cada empresa ve so o seu).
CREATE OR REPLACE FUNCTION public.get_li_showcase_products(p_mode text DEFAULT 'bestsellers', p_limit int DEFAULT 6, p_days int DEFAULT 90)
RETURNS TABLE (
  id uuid, name text, sku text, price numeric, promotional_price numeric,
  image_url text, image_path text, image_large text, url text, score numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH parents AS (
    SELECT * FROM public.get_li_parent_products()
  ),
  sold AS (
    SELECT COALESCE(substring(v.raw_json->>'pai' from '[0-9]+$'), (it->>'product_id')) AS parent_lid,
           sum(COALESCE((it->>'qty')::numeric, 1)) AS qty
    FROM public.li_orders o
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items_json, '[]'::jsonb)) AS it
    LEFT JOIN public.li_products v
      ON v.tenant_id = o.tenant_id AND v.loja_integrada_product_id::text = (it->>'product_id')
    WHERE p_mode = 'bestsellers'
      AND o.created_at_remote >= now() - make_interval(days => GREATEST(p_days, 1))
      AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
    GROUP BY 1
  )
  SELECT p.id, p.name, p.sku, p.price, p.promotional_price, p.image_url, p.image_path, p.image_large, p.url,
         CASE p_mode
           WHEN 'bestsellers' THEN COALESCE(s.qty, 0)
           WHEN 'newest'      THEN extract(epoch FROM (lp.raw_json->>'data_criacao')::timestamptz)
           ELSE COALESCE(p.price - p.promotional_price, 0)
         END AS score
  FROM parents p
  JOIN public.li_products lp ON lp.id = p.id
  LEFT JOIN sold s ON s.parent_lid = lp.loja_integrada_product_id::text
  WHERE (p.image_path IS NOT NULL OR p.image_large IS NOT NULL OR p.image_url IS NOT NULL)
    AND CASE p_mode
          WHEN 'bestsellers' THEN COALESCE(s.qty, 0) > 0
          WHEN 'newest'      THEN true
          WHEN 'promo'       THEN p.promotional_price IS NOT NULL AND p.promotional_price > 0 AND p.promotional_price < p.price
          ELSE false
        END
  ORDER BY score DESC NULLS LAST, p.name
  LIMIT LEAST(GREATEST(p_limit, 1), 24);
$$;

REVOKE EXECUTE ON FUNCTION public.get_li_showcase_products(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_li_showcase_products(text, int, int) TO authenticated, service_role;
