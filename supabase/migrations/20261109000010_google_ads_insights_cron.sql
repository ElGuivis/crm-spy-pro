-- Motor de descobertas: roda 1x/dia depois da coleta detalhada (regras em codigo, sem IA, sem custo de tokens).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-insights') THEN
    PERFORM cron.schedule('google-ads-insights', '55 9 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-insights',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END $$;
