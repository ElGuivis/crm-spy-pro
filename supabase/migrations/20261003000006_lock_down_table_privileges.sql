-- Endurece os privilegios de tabela do schema public (defesa em profundidade; o RLS continua sendo a regra principal).
--
-- Antes: `anon` (chave publica) tinha INSERT/UPDATE/DELETE/TRUNCATE em todas as tabelas e `authenticated` tinha
-- TRUNCATE/REFERENCES/TRIGGER. TRUNCATE ignora RLS. O app so usa `anon` para leitura publica dos templates
-- rapidos do Instagram (policy anyone_can_read_templates); todo o resto exige login ou roda com service_role.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON public.instagram_quick_automation_templates TO anon;

-- tabelas futuras ja nascem assim
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
