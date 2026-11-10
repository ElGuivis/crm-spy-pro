-- Medicao de resultado: para cada mudanca aplicada no Google, compara os 7 dias antes com os 7/14 dias depois.
-- Alimenta a taxa de acerto por tipo de acao (base para liberar a automacao com seguranca).
CREATE TABLE IF NOT EXISTS public.google_ads_action_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  audit_id uuid NOT NULL REFERENCES public.google_ads_audit_log(id) ON DELETE CASCADE,
  horizon_days integer NOT NULL CHECK (horizon_days IN (7, 14)),
  action_kind text NOT NULL,                 -- budget | enable | pause | rebuild | negatives | goal
  entity text NOT NULL,                      -- ex.: campaign:123, negatives:123, goal:BEGIN_CHECKOUT~WEBSITE
  campaign_id bigint,
  applied_at timestamptz NOT NULL,
  before_metrics jsonb NOT NULL,
  after_metrics jsonb NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('improved', 'neutral', 'worsened', 'insufficient', 'expected')),
  note text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_action_outcomes_tenant ON public.google_ads_action_outcomes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_action_outcomes_account ON public.google_ads_action_outcomes (account_id, applied_at DESC);
ALTER TABLE public.google_ads_action_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can view google_ads_action_outcomes" ON public.google_ads_action_outcomes
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
REVOKE ALL ON public.google_ads_action_outcomes FROM anon, authenticated;
GRANT SELECT ON public.google_ads_action_outcomes TO authenticated;
GRANT ALL ON public.google_ads_action_outcomes TO service_role;

-- Avaliacao diaria (leitura do banco, sem IA, sem tocar no Google).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'google-ads-outcomes') THEN
    PERFORM cron.schedule('google-ads-outcomes', '5 10 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/google-ads-outcomes',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 60000)
    $job$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
