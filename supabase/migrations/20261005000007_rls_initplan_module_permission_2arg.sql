-- Complemento da 20261003000008: a variante de 2 argumentos has_module_permission(uid, 'modulo') (sem o true/false) nao foi coberta e
-- continuava avaliada POR LINHA (me_shipments: 4.178 linhas = 57 ms com RLS contra 1,3 ms sem). Envolve a chamada inteira em (SELECT ...)
-- para o planejador calcular uma vez por consulta. Prova de equivalencia antes de confirmar; qualquer divergencia desfaz tudo.
-- Aplicar em transacao unica (psql --single-transaction).
SET LOCAL search_path = public, pg_catalog;

CREATE TEMP TABLE _policy_before_2arg ON COMMIT DROP AS
SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname IN ('public', 'storage');

CREATE OR REPLACE FUNCTION pg_temp.wrap_2arg(_expr text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(_expr,
    '(?<!SELECT )has_module_permission\(\(\s*SELECT auth\.uid\(\) AS uid\),\s*(''[a-z_]+''::module_permission)\)',
    '(SELECT has_module_permission(auth.uid(), \1))', 'g')
$$;
-- forma canonica: desfaz o envoltorio novo
CREATE OR REPLACE FUNCTION pg_temp.canon_2arg(_expr text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(coalesce(_expr, ''),
    '\(\s*SELECT\s+has_module_permission\(auth\.uid\(\),\s*(''[a-z_]+''::module_permission)\)(?:\s+AS\s+\w+)?\s*\)',
    'has_module_permission((SELECT auth.uid() AS uid), \1)', 'g'), '\s*([()])\s*', '\1', 'g')
$$;

DO $$
DECLARE
  r record; nq text; nc text; stmt text; changed int := 0; mismatch int := 0;
BEGIN
  FOR r IN SELECT * FROM _policy_before_2arg WHERE (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )has_module_permission\(\(\s*SELECT auth\.uid\(\) AS uid\),\s*''[a-z_]+''::module_permission\)'
  LOOP
    nq := CASE WHEN r.qual IS NULL THEN NULL ELSE pg_temp.wrap_2arg(r.qual) END;
    nc := CASE WHEN r.with_check IS NULL THEN NULL ELSE pg_temp.wrap_2arg(r.with_check) END;
    IF nq IS NOT DISTINCT FROM r.qual AND nc IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF nq IS NOT NULL THEN stmt := stmt || ' USING (' || nq || ')'; END IF;
    IF nc IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || nc || ')'; END IF;
    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  FOR r IN
    SELECT b.schemaname, b.tablename, b.policyname, b.qual AS oq, b.with_check AS oc, a.qual AS nq, a.with_check AS nc
    FROM _policy_before_2arg b JOIN pg_policies a USING (schemaname, tablename, policyname)
  LOOP
    IF pg_temp.canon_2arg(r.oq) IS DISTINCT FROM pg_temp.canon_2arg(r.nq) OR pg_temp.canon_2arg(r.oc) IS DISTINCT FROM pg_temp.canon_2arg(r.nc) THEN
      mismatch := mismatch + 1;
      RAISE WARNING 'divergencia em %.% / %', r.schemaname, r.tablename, r.policyname;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname IN ('public', 'storage')) <> (SELECT count(*) FROM _policy_before_2arg) THEN
    RAISE EXCEPTION 'a quantidade de policies mudou';
  END IF;
  IF mismatch > 0 THEN RAISE EXCEPTION 'equivalencia falhou em % policies; desfazendo', mismatch; END IF;
  RAISE NOTICE 'policies reescritas: %, divergencias: 0', changed;
END
$$;
