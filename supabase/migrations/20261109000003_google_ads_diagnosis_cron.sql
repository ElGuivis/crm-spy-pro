-- Google Ads Manager (fase 1, parte 3): chave de deduplicacao dos alertas e agendamento diario.
--
--  * google_ads_recommendations.dedupe_key: o diagnostico roda todo dia; a mesma situacao (ex.: saldo esgotado)
--    atualiza o alerta existente em vez de criar outro. Indice UNICO COMPLETO (nao parcial): o upsert do PostgREST
--    nao infere indice parcial (ver CLAUDE.md, armadilha dos cupons). NULL nao colide, entao recomendacoes
--    de outros agentes sem chave continuam livres.
--  * Crons: sincroniza e diagnostica 2x ao dia (06:00 e 18:00 em Sao Paulo = 09:00 e 21:00 UTC).

ALTER TABLE public.google_ads_recommendations
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS severity text CHECK (severity IS NULL OR severity IN ('critical', 'high', 'medium', 'low'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_ads_recommendations_dedupe
  ON public.google_ads_recommendations (account_id, dedupe_key);

COMMENT ON COLUMN public.google_ads_recommendations.dedupe_key IS
  'Chave estavel da situacao (ex.: R1:<conta>). Reexecutar o diagnostico atualiza a mesma linha.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-sync') THEN
    PERFORM cron.schedule('google-ads-sync', '0 9,21 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-sync',
                           headers := public.get_internal_headers(), body := '{"days":14}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-diagnose') THEN
    PERFORM cron.schedule('google-ads-diagnose', '10 9,21 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-diagnose',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
