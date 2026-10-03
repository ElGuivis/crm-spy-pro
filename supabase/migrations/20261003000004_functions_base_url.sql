-- A URL das edge functions deixa de ficar escrita em cada cron/funcao SQL.
-- Passa a vir de public.functions_base_url(): usa o setting do banco `app.settings.functions_url`
-- (ALTER DATABASE postgres SET app.settings.functions_url = 'https://...') e, sem ele, o padrao abaixo.
-- Trocar de dominio/servidor = mudar so o setting (ou o padrao) em um lugar.

CREATE OR REPLACE FUNCTION public.functions_base_url()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(nullif(current_setting('app.settings.functions_url', true), ''), 'https://api.spypro.com.br');
$$;

GRANT EXECUTE ON FUNCTION public.functions_base_url() TO postgres, service_role;

DO $$
DECLARE
  r   record;
  def text;
  new_def text;
  pat constant text := '''https://api\.spypro\.com\.br(/functions/v1/[^'']*)''';
  rep constant text := 'public.functions_base_url() || ''\1''';
BEGIN
  -- funcoes SQL
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ pat
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := regexp_replace(def, pat, rep, 'g');
    IF new_def <> def THEN EXECUTE new_def; END IF;
  END LOOP;

  -- crons
  FOR r IN SELECT jobid, command FROM cron.job WHERE command ~ pat LOOP
    PERFORM cron.alter_job(r.jobid, command := regexp_replace(r.command, pat, rep, 'g'));
  END LOOP;
END
$$;
