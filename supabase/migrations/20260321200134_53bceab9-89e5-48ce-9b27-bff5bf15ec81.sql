
-- Helper function to store CRON_SECRET in vault (called once from edge function)
CREATE OR REPLACE FUNCTION public.store_cron_secret(_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'CRON_SECRET';
  PERFORM vault.create_secret(_secret, 'CRON_SECRET', 'Used by pg_cron jobs for internal auth');
END;
$$;

-- Helper function to build auth headers for cron jobs (reads from vault at execution time)
CREATE OR REPLACE FUNCTION public.get_internal_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'missing-cron-secret'
    )
  );
$$;
