-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: HABILITAR RLS EM TODAS AS TABELAS
-- =============================================================================
-- Todas as 108 tabelas do sistema têm RLS habilitado

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- =============================================================================
-- POLÍTICAS RLS - PADRÃO MULTI-TENANT
-- =============================================================================
-- A maioria das tabelas segue o padrão: tenant_id = get_user_tenant_id(auth.uid())
-- Abaixo estão as policies para TODAS as tabelas.
-- Para o SQL completo com cada policy individual, consulte o banco atual via:
-- SELECT * FROM pg_policies WHERE schemaname = 'public';

-- EXEMPLO de policy padrão (repetido para ~90% das tabelas):
-- CREATE POLICY "tenant_select" ON public.TABELA FOR SELECT TO authenticated
--   USING (tenant_id = get_user_tenant_id(auth.uid()));
-- CREATE POLICY "tenant_insert" ON public.TABELA FOR INSERT TO authenticated
--   WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
-- CREATE POLICY "tenant_update" ON public.TABELA FOR UPDATE TO authenticated
--   USING (tenant_id = get_user_tenant_id(auth.uid()));
-- CREATE POLICY "tenant_delete" ON public.TABELA FOR DELETE TO authenticated
--   USING (tenant_id = get_user_tenant_id(auth.uid()));

-- NOTA: As policies exatas foram extraídas do banco e estão documentadas em sql/VPS_SETUP_GUIDE.md
-- Para replicar, execute: pg_dump --schema-only --section=post-data -t 'public.*' sua_url > rls.sql
