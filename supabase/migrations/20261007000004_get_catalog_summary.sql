-- Resumo do catalogo do tenant do usuario (tipos de produto mais comuns), para sugerir o perfil da loja.
-- SECURITY INVOKER: a RLS de li_products ja limita ao tenant do usuario; o filtro explicito reforca.
-- Considera so produtos pai (raw_json->>'pai' nulo); a primeira palavra do nome indica o tipo (Camiseta, Bone...).

CREATE OR REPLACE FUNCTION public.get_catalog_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT lower(split_part(btrim(name), ' ', 1)) AS kind
    FROM public.li_products
    WHERE tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
      AND raw_json->>'pai' IS NULL
      AND btrim(coalesce(name, '')) <> ''
  ), grouped AS (
    SELECT kind, count(*) AS total FROM base GROUP BY kind ORDER BY count(*) DESC, kind LIMIT 30
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'kinds', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'count', total) ORDER BY total DESC, kind) FROM grouped), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_catalog_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_catalog_summary() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
