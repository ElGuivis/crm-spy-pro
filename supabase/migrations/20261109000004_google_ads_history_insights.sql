-- Google Ads Manager (fase 2): historico completo, acoes de conversao e visoes agregadas para decisao.
--  * google_ads_conversion_actions: o que a conta conta como "conversao" (e se entra na coluna Conversoes).
--  * google_ads_conversion_monthly: conversoes por acao e mes (mostra QUEM gerou as conversoes).
--  * Visoes mensais (security_invoker => respeitam o RLS do usuario): evitam baixar milhares de linhas diarias.
-- Mesmas regras: RLS por tenant, usuario so le; escrita via edge functions (service_role).

CREATE TABLE IF NOT EXISTS public.google_ads_conversion_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  conversion_action_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  type text,
  category text,
  origin text,
  primary_for_goal boolean,
  include_in_conversions_metric boolean,
  counting_type text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, conversion_action_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_conversion_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  month date NOT NULL,
  conversion_action_name text NOT NULL,
  conversions numeric(18, 4) NOT NULL DEFAULT 0,
  conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, month, conversion_action_name)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_conv_actions_tenant ON public.google_ads_conversion_actions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_conv_monthly_tenant ON public.google_ads_conversion_monthly (tenant_id);

ALTER TABLE public.google_ads_conversion_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_conversion_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view google ads conversion actions"
  ON public.google_ads_conversion_actions FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
CREATE POLICY "Tenant members can view google ads conversion monthly"
  ON public.google_ads_conversion_monthly FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

-- Metricas por campanha e mes (a tabela diaria so existe por campanha/dia).
CREATE OR REPLACE VIEW public.google_ads_campaign_monthly WITH (security_invoker = true) AS
SELECT tenant_id, account_id, campaign_id,
       date_trunc('month', date)::date AS month,
       sum(impressions)::bigint AS impressions,
       sum(clicks)::bigint AS clicks,
       sum(cost_micros)::bigint AS cost_micros,
       sum(conversions) AS conversions,
       sum(conversions_value) AS conversions_value,
       count(*) FILTER (WHERE cost_micros > 0) AS days_with_spend
FROM public.google_ads_campaign_daily
GROUP BY tenant_id, account_id, campaign_id, date_trunc('month', date);

-- Totais de toda a vida de cada campanha (primeiro/ultimo dia com gasto).
CREATE OR REPLACE VIEW public.google_ads_campaign_lifetime WITH (security_invoker = true) AS
SELECT tenant_id, account_id, campaign_id,
       sum(impressions)::bigint AS impressions,
       sum(clicks)::bigint AS clicks,
       sum(cost_micros)::bigint AS cost_micros,
       sum(conversions) AS conversions,
       sum(conversions_value) AS conversions_value,
       min(date) FILTER (WHERE cost_micros > 0) AS first_spend_date,
       max(date) FILTER (WHERE cost_micros > 0) AS last_spend_date
FROM public.google_ads_campaign_daily
GROUP BY tenant_id, account_id, campaign_id;

REVOKE ALL ON public.google_ads_conversion_actions, public.google_ads_conversion_monthly,
  public.google_ads_campaign_monthly, public.google_ads_campaign_lifetime FROM anon, authenticated;
GRANT SELECT ON public.google_ads_conversion_actions, public.google_ads_conversion_monthly,
  public.google_ads_campaign_monthly, public.google_ads_campaign_lifetime TO authenticated;
GRANT ALL ON public.google_ads_conversion_actions, public.google_ads_conversion_monthly TO service_role;
GRANT SELECT ON public.google_ads_campaign_monthly, public.google_ads_campaign_lifetime TO service_role;

NOTIFY pgrst, 'reload schema';
