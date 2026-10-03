-- Desempenho (auditoria 03/10/2026): auth_rls_initplan + indices duplicados.
--
-- 1) As policies chamavam auth.uid() / get_user_tenant_id(auth.uid()) / has_module_permission(...) / auth.role()
--    diretamente. O Postgres reavalia isso POR LINHA. Envolver a chamada em (SELECT ...) faz o planejador calcular
--    uma vez por consulta (InitPlan). A semantica nao muda.
--    Esta migration prova a equivalencia antes de confirmar: remove os envoltorios das expressoes novas e compara
--    com as originais; qualquer diferenca levanta excecao e desfaz tudo.
--
-- 2) Indices duplicados: apaga o lado que NAO sustenta chave/constraint.

SET LOCAL search_path = public, pg_catalog;

CREATE TEMP TABLE _policy_before ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage');

CREATE OR REPLACE FUNCTION pg_temp.wrap_rls(_expr text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(_expr, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g'),
               'get_user_tenant_id\(\(SELECT auth\.uid\(\)\)\)', '(SELECT get_user_tenant_id(auth.uid()))', 'g'),
             'has_module_permission\(\(SELECT auth\.uid\(\)\)\s*,\s*(''[a-z_]+''::module_permission)\s*,\s*(true|false)\s*\)',
             '(SELECT has_module_permission(auth.uid(), \1, \2))', 'g'),
           '(?<!SELECT )auth\.role\(\)', '(SELECT auth.role())', 'g');
$$;

-- forma canonica: tira os envoltorios (SELECT ... AS x) das chamadas conhecidas (sai do mais interno para o externo)
CREATE OR REPLACE FUNCTION pg_temp.canon_rls(_expr text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  cur text := coalesce(_expr, '');
  prev text;
  i int := 0;
BEGIN
  LOOP
    prev := cur;
    cur := regexp_replace(cur,
      '\(\s*SELECT\s+(auth\.(?:uid|role|jwt)\(\)|get_user_tenant_id\(auth\.uid\(\)\)|has_module_permission\(auth\.uid\(\),\s*''[a-z_]+''::module_permission,\s*(?:true|false)\))\s+AS\s+\w+\s*\)',
      '\1', 'g');
    cur := regexp_replace(cur,
      '\(\s*SELECT\s+(auth\.(?:uid|role|jwt)\(\)|get_user_tenant_id\(auth\.uid\(\)\)|has_module_permission\(auth\.uid\(\),\s*''[a-z_]+''::module_permission,\s*(?:true|false)\))\s*\)',
      '\1', 'g');
    cur := regexp_replace(cur, '\s+', ' ', 'g');
    i := i + 1;
    EXIT WHEN cur = prev OR i > 6;
  END LOOP;
  RETURN cur;
END;
$$;

DO $$
DECLARE
  r record;
  new_q text;
  new_c text;
  stmt text;
  changed int := 0;
  mismatch int := 0;
BEGIN
  FOR r IN
    SELECT * FROM _policy_before
    WHERE (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|auth\.role\(\))'
      AND (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT\s+(get_user_tenant_id|has_module_permission|auth\.uid|auth\.role)'
  LOOP
    new_q := CASE WHEN r.qual IS NULL THEN NULL ELSE pg_temp.wrap_rls(r.qual) END;
    new_c := CASE WHEN r.with_check IS NULL THEN NULL ELSE pg_temp.wrap_rls(r.with_check) END;
    IF new_q IS NOT DISTINCT FROM r.qual AND new_c IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_q IS NOT NULL THEN stmt := stmt || ' USING (' || new_q || ')'; END IF;
    IF new_c IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || new_c || ')'; END IF;
    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  -- prova de equivalencia: depois de remover os envoltorios, nada pode ter mudado
  FOR r IN
    SELECT b.schemaname, b.tablename, b.policyname, b.qual AS oq, b.with_check AS oc, a.qual AS nq, a.with_check AS nc
    FROM _policy_before b
    JOIN pg_policies a USING (schemaname, tablename, policyname)
  LOOP
    IF pg_temp.canon_rls(r.oq) IS DISTINCT FROM pg_temp.canon_rls(r.nq)
       OR pg_temp.canon_rls(r.oc) IS DISTINCT FROM pg_temp.canon_rls(r.nc) THEN
      mismatch := mismatch + 1;
      RAISE WARNING 'divergencia em %.% / %', r.schemaname, r.tablename, r.policyname;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage')) <> (SELECT count(*) FROM _policy_before) THEN
    RAISE EXCEPTION 'a quantidade de policies mudou';
  END IF;
  IF mismatch > 0 THEN
    RAISE EXCEPTION 'equivalencia falhou em % policies; desfazendo', mismatch;
  END IF;
  RAISE NOTICE 'policies reescritas: %, divergencias: 0', changed;
END
$$;

-- indices duplicados (o outro lado de cada par sustenta uma UNIQUE/ou e identico)
DROP INDEX IF EXISTS public.idx_contacts_tenant_phone;                 -- = contacts_tenant_id_phone_key
DROP INDEX IF EXISTS public.idx_email_campaign_logs_campaign;          -- = idx_email_campaign_logs_campaign_id
DROP INDEX IF EXISTS public.idx_ig_flow_runs_idemp;                    -- = instagram_flow_runs_idempotency_key_key
DROP INDEX IF EXISTS public.idx_me_shipments_external_order;           -- = idx_me_shipments_external_order_number
DROP INDEX IF EXISTS public.idx_reactivation_cycle_steps_config;       -- = reactivation_cycle_steps_config_id_step_number_key
