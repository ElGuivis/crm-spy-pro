-- Limpa o historico dos crons todo dia (cron.job_run_details crescia ~17 mil linhas/dia e
-- chegou a 120 mil linhas / 74 MB). As respostas do pg_net ja expiram sozinhas (pg_net.ttl = 6h).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-history-cleanup-daily') THEN
    PERFORM cron.schedule(
      'cron-history-cleanup-daily',
      '30 4 * * *',
      $job$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'$job$
    );
  END IF;
END
$$;
