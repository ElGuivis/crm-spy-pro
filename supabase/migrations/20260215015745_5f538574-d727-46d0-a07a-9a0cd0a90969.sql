-- Update cron status functions to reference the new reconciliation cron job
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-reconciliation-processor-every-3-min'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_last_run()
 RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-reconciliation-processor-every-3-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$function$;