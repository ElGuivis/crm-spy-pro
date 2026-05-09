-- After the Lovable→Supabase migration, 18 cron jobs were left with a
-- hardcoded anon JWT in the Authorization header. Every target is an
-- edge function that calls requireInternalAuth, which expects either
-- service_role or CRON_SECRET — so each fire returned 500 (auth-guard
-- throws a Response, the catch handler stringifies it as
-- "[object Response]" or "Unknown error").
--
-- This migration rewrites every still-broken cron command to use
-- public.get_internal_headers() instead of the static headers literal.
-- The function emits {x-cron-secret: <vault CRON_SECRET>} which the
-- auth-guard recognises.
--
-- Targets the cron jobs by detecting the base64 fragment of "role":"anon"
-- inside the JWT payload, so already-correct cron jobs (19, 20, 21, 22)
-- are skipped automatically.

DO $$
DECLARE
  job RECORD;
  new_command text;
BEGIN
  FOR job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command ~ 'cm9sZSI6ImFub24'
  LOOP
    new_command := regexp_replace(
      job.command,
      'headers\s*:=\s*''[^'']*''::jsonb',
      'headers := public.get_internal_headers()',
      'g'
    );

    PERFORM cron.alter_job(job_id := job.jobid, command := new_command);
    RAISE NOTICE 'Fixed cron % (%)', job.jobid, job.jobname;
  END LOOP;
END $$;
