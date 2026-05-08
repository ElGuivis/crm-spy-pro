-- Add external_order_number column to me_shipments
ALTER TABLE me_shipments ADD COLUMN IF NOT EXISTS external_order_number TEXT;

-- Create index for order number lookups
CREATE INDEX IF NOT EXISTS idx_me_shipments_external_order ON me_shipments(tenant_id, external_order_number);

-- Function to get Melhor Envio cron job status
CREATE OR REPLACE FUNCTION public.get_me_cron_job_status()
RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'melhor-envio-sync-hourly'
  LIMIT 1;
$$;

-- Function to get Melhor Envio cron last run
CREATE OR REPLACE FUNCTION public.get_me_cron_last_run()
RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'melhor-envio-sync-hourly'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;