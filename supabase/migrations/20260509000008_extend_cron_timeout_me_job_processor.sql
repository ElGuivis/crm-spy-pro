-- Extend pg_net timeout for me-job-processor cron (cron 12).
-- The processor finds all active ME integrations and reconciles their
-- shipments via the Melhor Envio API. With paginated calls + per-shipment
-- updates this consistently exceeds the 5000ms default pg_net timeout.

DO $$
DECLARE
  job RECORD;
  new_command text;
BEGIN
  FOR job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname = 'me-job-processor-every-5-min'
  LOOP
    IF position('timeout_milliseconds' in job.command) > 0 THEN
      new_command := regexp_replace(
        job.command,
        'timeout_milliseconds\s*:=\s*\d+',
        'timeout_milliseconds := 90000',
        'g'
      );
    ELSE
      new_command := regexp_replace(
        job.command,
        E'(body\\s*:=\\s*[^\\)]+)\\)',
        E'\\1,\n    timeout_milliseconds := 90000\n  )',
        'g'
      );
    END IF;

    PERFORM cron.alter_job(job_id := job.jobid, command := new_command);
    RAISE NOTICE 'Extended timeout on cron % (%)', job.jobid, job.jobname;
  END LOOP;
END $$;
