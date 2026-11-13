-- Conversao "Compra paga (CRM)": envia ao Google Ads so as vendas realmente pagas (com o gclid do clique,
-- guardado pela loja no campo utm_campaign no formato <campaignid>_<gclid>) e retrata as canceladas/devolvidas.
-- Motivo: o evento purchase do site dispara ao CRIAR o pedido (cartao recusado e retentativas contam como venda).
ALTER TABLE public.google_ads_accounts
  ADD COLUMN IF NOT EXISTS offline_conversion_action_id bigint;

CREATE TABLE IF NOT EXISTS public.google_ads_offline_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  campaign_id bigint,
  gclid text NOT NULL,
  value numeric(12, 2) NOT NULL DEFAULT 0,
  conversion_time timestamptz NOT NULL,
  li_status text,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'uploaded', 'failed', 'retracted', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  uploaded_at timestamptz,
  retracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_offline_conv_tenant ON public.google_ads_offline_conversions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_offline_conv_status ON public.google_ads_offline_conversions (account_id, status);
ALTER TABLE public.google_ads_offline_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can view google_ads_offline_conversions" ON public.google_ads_offline_conversions
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
REVOKE ALL ON public.google_ads_offline_conversions FROM anon, authenticated;
GRANT SELECT ON public.google_ads_offline_conversions TO authenticated;
GRANT ALL ON public.google_ads_offline_conversions TO service_role;

-- A cada 15 minutos (so atua se a conta tiver offline_conversion_action_id preenchido).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-offline-conversions') THEN
    PERFORM cron.schedule('google-ads-offline-conversions', '*/15 * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-offline-conversions',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 60000)
    $job$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
