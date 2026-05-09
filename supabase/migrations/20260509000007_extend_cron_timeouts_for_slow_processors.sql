-- Extend the pg_net timeout for cron-driven LI sync processors.
-- li-job-processor (cron 4) and li-reconciliation-processor (cron 3) iterate
-- through every connected LI integration calling the LI API for incremental
-- sync of orders/customers/products/carts/coupons. With the SpyComp tenant
-- (~9k orders, 15k customers, 7k products) a normal run easily exceeds the
-- 5000ms default pg_net timeout, leaving the cron with a NULL status_code
-- response even though the function itself completed.
--
-- Bump these two crons to 90s. Deno Edge runtime caps at ~150s, so anything
-- the function genuinely needs longer than this should be split into
-- background work via EdgeRuntime.waitUntil (li-sync already does that).

DO $$
DECLARE
  job RECORD;
  new_command text;
BEGIN
  FOR job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname IN (
      'invoke-li-job-processor-every-5-min',
      'invoke-li-reconciliation-processor-every-3-min'
    )
  LOOP
    -- If timeout already specified, replace it; otherwise inject before AS request_id
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
