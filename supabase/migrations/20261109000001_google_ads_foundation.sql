-- Google Ads Manager (fase 1): contas, campanhas, metricas diarias, recomendacoes dos agentes e trilha de auditoria.
--
-- Principios:
--  * Tudo por tenant, com RLS. Usuarios autenticados so LEEM; toda escrita passa pelas edge functions
--    (service_role), que validam o usuario e gravam a trilha de auditoria.
--  * Nenhuma mudanca na conta do Google Ads acontece sem uma recomendacao aprovada (modo 'approval') e
--    sempre fica registrada em google_ads_audit_log. O modo padrao e 'read_only'.
--  * Credenciais (developer token, client id/secret, refresh token) NAO ficam aqui: vao nos secrets das
--    edge functions (/opt/supabase/functions.env).

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id text NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
  login_customer_id text CHECK (login_customer_id IS NULL OR login_customer_id ~ '^[0-9]{10}$'),
  descriptive_name text,
  currency_code text,
  time_zone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  -- read_only: so le e recomenda | approval: aplica so o que o usuario aprovar | auto: aplica sozinho dentro dos limites
  mode text NOT NULL DEFAULT 'read_only' CHECK (mode IN ('read_only', 'approval', 'auto')),
  -- Limites de seguranca do modo auto (ex.: {"max_daily_budget_change_pct": 20, "max_daily_budget_micros": 50000000})
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

COMMENT ON TABLE public.google_ads_accounts IS
  'Contas do Google Ads do tenant. mode controla o que os agentes podem fazer (padrao read_only).';

-- ---------------------------------------------------------------------------
-- Campanhas (espelho do que existe no Google Ads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  channel_type text,
  bidding_strategy_type text,
  daily_budget_micros bigint,
  start_date date,
  end_date date,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_campaigns_tenant ON public.google_ads_campaigns (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Metricas diarias por campanha
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_campaign_daily (
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  date date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0,
  conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_campaign_daily_tenant_date
  ON public.google_ads_campaign_daily (tenant_id, date DESC);

-- ---------------------------------------------------------------------------
-- Recomendacoes dos agentes (nada e aplicado sem passar por aqui)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  agent text NOT NULL,                       -- ex.: performance_analyst, budget_manager, copywriter, orchestrator
  kind text NOT NULL,                        -- ex.: pause_campaign, adjust_budget, add_negative_keyword, new_ad_copy, insight
  title text NOT NULL,
  rationale text NOT NULL,                   -- o porque, com os numeros que sustentam
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, -- acao exata proposta (o que seria enviado ao Google Ads)
  risk text NOT NULL DEFAULT 'medium' CHECK (risk IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'failed', 'expired')),
  decided_by uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  error text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_recommendations_size_check CHECK (
    length(title) <= 300 AND length(rationale) <= 8000 AND length(payload::text) <= 20000
  )
);

CREATE INDEX IF NOT EXISTS idx_google_ads_recommendations_tenant_status
  ON public.google_ads_recommendations (tenant_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Trilha de auditoria (somente acrescentar: ninguem edita nem apaga)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.google_ads_accounts(id) ON DELETE SET NULL,
  recommendation_id uuid REFERENCES public.google_ads_recommendations(id) ON DELETE SET NULL,
  actor text NOT NULL,                       -- 'user:<uuid>' ou 'agent:<nome>' ou 'system'
  action text NOT NULL,                      -- ex.: sync, recommend, approve, reject, apply, mode_change
  entity text,                               -- ex.: campaign:123456
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_audit_log_tenant
  ON public.google_ads_audit_log (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: leitura por tenant; escrita somente via service_role (edge functions)
-- ---------------------------------------------------------------------------
ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaign_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view google ads accounts"
  ON public.google_ads_accounts FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant members can view google ads campaigns"
  ON public.google_ads_campaigns FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant members can view google ads daily metrics"
  ON public.google_ads_campaign_daily FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant members can view google ads recommendations"
  ON public.google_ads_recommendations FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant admins can view google ads audit log"
  ON public.google_ads_audit_log FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Gatilhos de updated_at e privilegios
-- ---------------------------------------------------------------------------
CREATE TRIGGER update_google_ads_accounts_updated_at
  BEFORE UPDATE ON public.google_ads_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_ads_recommendations_updated_at
  BEFORE UPDATE ON public.google_ads_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.google_ads_accounts, public.google_ads_campaigns, public.google_ads_campaign_daily,
  public.google_ads_recommendations, public.google_ads_audit_log FROM anon, authenticated;

GRANT SELECT ON public.google_ads_accounts, public.google_ads_campaigns, public.google_ads_campaign_daily,
  public.google_ads_recommendations, public.google_ads_audit_log TO authenticated;

GRANT ALL ON public.google_ads_accounts, public.google_ads_campaigns, public.google_ads_campaign_daily,
  public.google_ads_recommendations, public.google_ads_audit_log TO service_role;

NOTIFY pgrst, 'reload schema';
