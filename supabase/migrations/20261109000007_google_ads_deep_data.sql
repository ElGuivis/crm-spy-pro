-- Google Ads Manager (fase 4): dados "profundos" do Google para os agentes decidirem com base em dados reais.
-- Tudo somente leitura do Google: termos de pesquisa, palavras-chave (com nota de qualidade), anuncios, grupos,
-- dispositivo, dia/hora, regioes, participacao de impressoes, produtos (Shopping), paginas de destino, idade/genero,
-- ativos da Performance Max, negativas, publicos, estrategias de lance, conversoes por campanha, mudancas e
-- recomendacoes do proprio Google. RLS por tenant (usuario so le); escrita via edge function (service_role).
-- Colunas de metricas (padrao): impressions, clicks, cost_micros, conversions, conversions_value.

-- ---------------------------------------------------------------------------
-- Colunas novas em tabelas existentes
-- ---------------------------------------------------------------------------
ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS optimization_score numeric(6, 4),
  ADD COLUMN IF NOT EXISTS target_roas numeric(12, 4),
  ADD COLUMN IF NOT EXISTS target_cpa_micros bigint,
  ADD COLUMN IF NOT EXISTS bidding_strategy_resource text,
  ADD COLUMN IF NOT EXISTS search_network boolean,
  ADD COLUMN IF NOT EXISTS content_network boolean;

ALTER TABLE public.google_ads_accounts
  ADD COLUMN IF NOT EXISTS auto_tagging_enabled boolean,
  ADD COLUMN IF NOT EXISTS conversion_tracking_status text,
  ADD COLUMN IF NOT EXISTS optimization_score numeric(6, 4),
  ADD COLUMN IF NOT EXISTS deep_synced_at timestamptz;

ALTER TABLE public.google_ads_campaign_daily
  ADD COLUMN IF NOT EXISTS all_conversions numeric(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_through_conversions bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interactions bigint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_ad_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  ad_group_id bigint NOT NULL,
  campaign_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  type text,
  cpc_bid_micros bigint,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ad_group_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  ad_id bigint NOT NULL,
  ad_group_id bigint NOT NULL,
  campaign_id bigint NOT NULL,
  type text,
  name text,
  status text NOT NULL,
  ad_strength text,
  approval_status text,
  final_url text,
  headlines jsonb NOT NULL DEFAULT '[]'::jsonb,
  descriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ad_group_id, ad_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  ad_group_id bigint NOT NULL,
  criterion_id bigint NOT NULL,
  campaign_id bigint NOT NULL,
  text text NOT NULL,
  match_type text,
  status text NOT NULL,
  negative boolean NOT NULL DEFAULT false,
  quality_score smallint,
  creative_quality text,
  landing_page_quality text,
  predicted_ctr text,
  cpc_bid_micros bigint,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ad_group_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_search_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  ad_group_id bigint NOT NULL,
  search_term text NOT NULL,
  year smallint NOT NULL,
  status text,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, ad_group_id, search_term, year)
);

CREATE TABLE IF NOT EXISTS public.google_ads_device_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  device text NOT NULL,
  month date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, device, month)
);

CREATE TABLE IF NOT EXISTS public.google_ads_hour_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  day_of_week text NOT NULL,
  hour smallint NOT NULL,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, year, day_of_week, hour)
);

CREATE TABLE IF NOT EXISTS public.google_ads_geo_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  region_key text NOT NULL,           -- id do geoTargetConstant da regiao (ou do pais, se nao houver regiao)
  region_name text,
  location_type text NOT NULL DEFAULT 'UNKNOWN',
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, region_key, location_type)
);

CREATE TABLE IF NOT EXISTS public.google_ads_impression_share (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  month date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  search_impression_share numeric(7, 6),
  search_top_impression_share numeric(7, 6),
  search_abs_top_impression_share numeric(7, 6),
  search_budget_lost_share numeric(7, 6),
  search_rank_lost_share numeric(7, 6),
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, month)
);

CREATE TABLE IF NOT EXISTS public.google_ads_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  title text,
  brand text,
  type_l1 text,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  url text NOT NULL,
  speed_score smallint,
  mobile_friendly_clicks_pct numeric(7, 6),
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, url)
);

CREATE TABLE IF NOT EXISTS public.google_ads_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('age', 'gender')),
  value text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(18, 4) NOT NULL DEFAULT 0, conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, dimension, value)
);

CREATE TABLE IF NOT EXISTS public.google_ads_asset_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  asset_group_id bigint NOT NULL,
  campaign_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  ad_strength text,
  primary_status text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, asset_group_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_asset_group_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  asset_group_id bigint NOT NULL,
  asset_id bigint NOT NULL,
  field_type text NOT NULL,
  status text,
  asset_type text,
  name text,
  text text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, asset_group_id, asset_id, field_type)
);

CREATE TABLE IF NOT EXISTS public.google_ads_negatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('campaign', 'shared_set')),
  ref_id text NOT NULL,               -- campaign:<id>~<criterio> ou id do shared set
  campaign_id bigint,
  text text,
  match_type text,
  type text,
  member_count integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source, ref_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_user_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  user_list_id bigint NOT NULL,
  name text NOT NULL,
  type text,
  size_for_search bigint,
  size_for_display bigint,
  membership_status text,
  membership_life_span integer,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, user_list_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_bidding_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  strategy_id bigint NOT NULL,
  name text,
  type text,
  target_roas numeric(12, 4),
  target_cpa_micros bigint,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, strategy_id)
);

CREATE TABLE IF NOT EXISTS public.google_ads_campaign_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  campaign_id bigint NOT NULL,
  month date NOT NULL,
  conversion_action_name text NOT NULL,
  conversions numeric(18, 4) NOT NULL DEFAULT 0,
  conversions_value numeric(18, 4) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, campaign_id, month, conversion_action_name)
);

CREATE TABLE IF NOT EXISTS public.google_ads_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  changed_at timestamptz NOT NULL,
  resource_type text,
  operation text,
  changed_fields text,
  user_email text,
  client_type text,
  campaign_resource text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.google_ads_google_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  rec_key text NOT NULL,
  type text NOT NULL,
  campaign_id bigint,
  dismissed boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, rec_key)
);

-- ---------------------------------------------------------------------------
-- Indices de consulta, RLS e privilegios (todas as tabelas acima, de uma vez)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gads_search_terms_cost ON public.google_ads_search_terms (account_id, cost_micros DESC);
CREATE INDEX IF NOT EXISTS idx_gads_keywords_cost ON public.google_ads_keywords (account_id, cost_micros DESC);
CREATE INDEX IF NOT EXISTS idx_gads_products_cost ON public.google_ads_products (account_id, cost_micros DESC);
CREATE INDEX IF NOT EXISTS idx_gads_changes_time ON public.google_ads_changes (account_id, changed_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'google_ads_ad_groups', 'google_ads_ads', 'google_ads_keywords', 'google_ads_search_terms', 'google_ads_device_monthly',
    'google_ads_hour_stats', 'google_ads_geo_stats', 'google_ads_impression_share', 'google_ads_products',
    'google_ads_landing_pages', 'google_ads_demographics', 'google_ads_asset_groups', 'google_ads_asset_group_assets',
    'google_ads_negatives', 'google_ads_user_lists', 'google_ads_bidding_strategies', 'google_ads_campaign_conversions',
    'google_ads_changes', 'google_ads_google_recommendations'
  ] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_' || t || '_tenant', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))))',
      'Tenant members can view ' || t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
