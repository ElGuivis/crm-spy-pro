-- Google Ads Manager (fase 1, parte 2): dados para o agente de diagnostico e metas por campanha.
--
--  * google_ads_account_budget: limite de gastos da conta (account budget). A suspensao de entrega por saldo
--    esgotado so aparece comparando amount_served com o limite (a API devolve o motivo como UNKNOWN).
--  * Colunas de status de entrega em google_ads_accounts / google_ads_campaigns.
--  * google_ads_campaign_targets: meta de cada campanha (CPA maximo ou ROAS minimo), definida pelo usuario.
-- Mesmas regras da migration anterior: RLS por tenant, usuario so le; escrita via edge functions (service_role).

-- ---------------------------------------------------------------------------
-- Status de conta e de entrega das campanhas
-- ---------------------------------------------------------------------------
ALTER TABLE public.google_ads_accounts
  ADD COLUMN IF NOT EXISTS customer_status text,
  ADD COLUMN IF NOT EXISTS billing_status text;

ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS serving_status text,
  ADD COLUMN IF NOT EXISTS primary_status text,
  ADD COLUMN IF NOT EXISTS primary_status_reasons text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.google_ads_campaigns.primary_status_reasons IS
  'Motivos devolvidos pelo Google (texto bruto; a API costuma devolver UNKNOWN para codigos novos).';

-- ---------------------------------------------------------------------------
-- Orcamento (limite de gastos) da conta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_account_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  account_budget_id bigint NOT NULL,
  status text NOT NULL,
  approved_spending_limit_micros bigint,
  adjusted_spending_limit_micros bigint,
  amount_served_micros bigint NOT NULL DEFAULT 0,
  approved_start_date_time timestamptz,
  approved_end_date_time timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, account_budget_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_account_budget_tenant ON public.google_ads_account_budget (tenant_id);

-- ---------------------------------------------------------------------------
-- Metas por campanha (definidas pelo usuario)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('cpa_max', 'roas_min')),
  target_value numeric(18, 4) NOT NULL CHECK (target_value > 0),
  monthly_budget_cap_micros bigint CHECK (monthly_budget_cap_micros IS NULL OR monthly_budget_cap_micros > 0),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id)
);

COMMENT ON TABLE public.google_ads_campaign_targets IS
  'Meta por campanha. cpa_max em moeda da conta (ex.: 45.00 = R$ 45 por venda); roas_min como razao (ex.: 4 = R$ 4 de receita por R$ 1).';

-- ---------------------------------------------------------------------------
-- RLS e privilegios
-- ---------------------------------------------------------------------------
ALTER TABLE public.google_ads_account_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaign_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view google ads account budget"
  ON public.google_ads_account_budget FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant members can view google ads campaign targets"
  ON public.google_ads_campaign_targets FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE TRIGGER update_google_ads_campaign_targets_updated_at
  BEFORE UPDATE ON public.google_ads_campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.google_ads_account_budget, public.google_ads_campaign_targets FROM anon, authenticated;
GRANT SELECT ON public.google_ads_account_budget, public.google_ads_campaign_targets TO authenticated;
GRANT ALL ON public.google_ads_account_budget, public.google_ads_campaign_targets TO service_role;

NOTIFY pgrst, 'reload schema';
