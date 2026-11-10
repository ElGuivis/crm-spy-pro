-- Economia da loja: recalcula 1x/dia (leitura do CRM, sem IA) antes das descobertas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-economics') THEN
    PERFORM cron.schedule('google-ads-economics', '50 9 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-economics',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 60000)
    $job$);
  END IF;
END $$;

-- Metas aprovadas pelo dono em 2026-11-10: piso 4,0 / alvo 5,0 / alerta abaixo de 3,0 (so completa o que falta).
UPDATE public.google_ads_accounts
SET guardrails = guardrails || jsonb_build_object('min_roas', COALESCE((guardrails->>'min_roas')::numeric, 4), 'target_roas', 5, 'alert_roas', 3)
WHERE NOT (guardrails ? 'target_roas');
