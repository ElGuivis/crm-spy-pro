-- Busca sem acento para a IA: "bone" precisa achar "Bone/Boné", "devolucao" achar "devolução".
-- ilike nao casa acento (bone = 0 achados, bone com acento = 174). unaccent comparando os dois lados resolve.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = extensions, public
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- fts da base de conhecimento passa a ignorar acento (tabela nova, ainda sem dados)
DROP INDEX IF EXISTS public.tenant_knowledge_docs_fts_idx;
ALTER TABLE public.tenant_knowledge_docs DROP COLUMN fts;
ALTER TABLE public.tenant_knowledge_docs ADD COLUMN fts tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
  setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(category, ''))), 'B') ||
  setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(content, ''))), 'C')
) STORED;
CREATE INDEX tenant_knowledge_docs_fts_idx ON public.tenant_knowledge_docs USING gin (fts);

-- Produtos disponiveis (ativos com estoque) por nome, sem acento. p_terms: so letras/numeros (o chamador filtra).
-- p_mode 'all' = todos os termos; 'any' = qualquer um. Chamada pelo ai-chat (service_role) com o tenant da conversa.
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
  ORDER BY p.stock DESC, p.name
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Documentos da loja que respondem a pergunta (melhor primeiro).
CREATE OR REPLACE FUNCTION public.search_knowledge_docs(p_tenant uuid, p_terms text[], p_limit integer DEFAULT 3)
RETURNS TABLE (title text, category text, content text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT to_tsquery('portuguese', string_agg(public.immutable_unaccent(lower(t)), ' | ')) AS tsq
    FROM unnest(p_terms) t
    WHERE t ~ '^[[:alnum:]]+$'
  )
  SELECT d.title, d.category, d.content
  FROM public.tenant_knowledge_docs d, q
  WHERE q.tsq IS NOT NULL AND d.tenant_id = p_tenant AND d.is_active AND d.fts @@ q.tsq
  ORDER BY ts_rank(d.fts, q.tsq) DESC
  LIMIT greatest(1, least(coalesce(p_limit, 3), 10));
$$;

REVOKE ALL ON FUNCTION public.search_available_products(uuid, text[], text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_knowledge_docs(uuid, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_available_products(uuid, text[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_docs(uuid, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
