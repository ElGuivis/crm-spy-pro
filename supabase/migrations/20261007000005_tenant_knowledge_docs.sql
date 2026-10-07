-- Base de conhecimento da loja (FAQ, politicas, guias) por tenant, consultada pela IA por busca de texto
-- em portugues (tsvector). Sem dependencia de extensao nova. Cada loja so ve e usa os proprios documentos.

CREATE TABLE IF NOT EXISTS public.tenant_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(content, '')), 'C')
  ) STORED,
  CONSTRAINT tenant_knowledge_docs_size_check CHECK (
    length(btrim(title)) BETWEEN 1 AND 200
    AND length(btrim(content)) BETWEEN 1 AND 6000
    AND coalesce(length(category), 0) <= 100
  )
);

COMMENT ON TABLE public.tenant_knowledge_docs IS 'Documentos curtos da loja (FAQ, politicas, guias) usados pela IA; busca por fts (portugues).';

CREATE INDEX IF NOT EXISTS tenant_knowledge_docs_tenant_idx ON public.tenant_knowledge_docs (tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS tenant_knowledge_docs_fts_idx ON public.tenant_knowledge_docs USING gin (fts);

ALTER TABLE public.tenant_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's knowledge docs"
  ON public.tenant_knowledge_docs FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant admins can manage knowledge docs"
  ON public.tenant_knowledge_docs TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  );

CREATE TRIGGER update_tenant_knowledge_docs_updated_at
  BEFORE UPDATE ON public.tenant_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.tenant_knowledge_docs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_knowledge_docs TO authenticated;
GRANT ALL ON public.tenant_knowledge_docs TO service_role;

NOTIFY pgrst, 'reload schema';
