-- Google Ads Manager: crons da coleta profunda (somente leitura no Google), escalonados para nao pesar no runtime.
--  structure: 2x/dia (apos a sincronizacao principal); stats: 1x/dia; static: segunda-feira (dados pesados e lentos).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-sync-deep-structure') THEN
    PERFORM cron.schedule('google-ads-sync-deep-structure', '20 9,21 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-sync-deep',
                           headers := public.get_internal_headers(), body := '{"preset":"structure"}'::jsonb, timeout_milliseconds := 100000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-sync-deep-stats') THEN
    PERFORM cron.schedule('google-ads-sync-deep-stats', '40 9 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-sync-deep',
                           headers := public.get_internal_headers(), body := '{"preset":"stats"}'::jsonb, timeout_milliseconds := 100000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-sync-deep-static') THEN
    PERFORM cron.schedule('google-ads-sync-deep-static', '0 8 * * 1', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-sync-deep',
                           headers := public.get_internal_headers(), body := '{"preset":"static"}'::jsonb, timeout_milliseconds := 100000)
    $job$);
  END IF;
END $$;
