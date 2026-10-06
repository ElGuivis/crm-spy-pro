-- A10 (auditoria 03/10/2026): 235 policies do schema public estavam "TO public" (inclui anon), todas com condicao de tenant/usuario.
-- O anon nao tem privilegio nessas tabelas (so em instagram_quick_automation_templates), entao nada muda no comportamento; passam a
-- "TO authenticated" para nao depender so dos GRANTs. Ficam publicas DE PROPOSITO: instagram_quick_automation_templates (modelos
-- publicos, anon com SELECT) e token_plans (planos ativos visiveis). service_role ignora RLS e nao e afetado.
-- Aplicar em transacao unica; a propria migration confere que so o papel mudou e que a contagem fecha.
DO $$
DECLARE
  r record; n int := 0; before_total int; before_pub int; after_pub int; after_auth_delta int; before_auth int;
BEGIN
  SELECT count(*) INTO before_total FROM pg_policies WHERE schemaname = 'public';
  SELECT count(*) INTO before_pub FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}';
  SELECT count(*) INTO before_auth FROM pg_policies WHERE schemaname = 'public' AND roles = '{authenticated}';

  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND roles = '{public}'
      AND NOT (tablename = 'instagram_quick_automation_templates' AND policyname = 'anyone_can_read_templates')
      AND NOT (tablename = 'token_plans' AND policyname = 'Anyone can view active token plans')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
    n := n + 1;
  END LOOP;

  SELECT count(*) INTO after_pub FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}';
  SELECT count(*) - before_auth INTO after_auth_delta FROM pg_policies WHERE schemaname = 'public' AND roles = '{authenticated}';
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> before_total THEN RAISE EXCEPTION 'a quantidade de policies mudou'; END IF;
  IF after_pub <> 2 OR after_auth_delta <> n OR n <> before_pub - 2 THEN
    RAISE EXCEPTION 'conferencia falhou (publicas depois=%, migradas=%, esperadas=%)', after_pub, n, before_pub - 2;
  END IF;
  RAISE NOTICE 'policies movidas para authenticated: %, publicas restantes: %', n, after_pub;
END
$$;
