-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS RFM
-- =============================================================================

CREATE TABLE public.customer_rfm_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, integration_id uuid NOT NULL,
  source_type text NOT NULL, customer_id text NOT NULL,
  customer_name text, customer_email text, customer_phone text, customer_doc text,
  last_order_date timestamptz, recency_days integer, orders_count integer,
  revenue_total numeric DEFAULT 0, aov numeric DEFAULT 0, avg_order_interval_days numeric,
  r_score integer, f_score integer, m_score integer, rfm_score text,
  segment_name text, segment_action text, churn_risk text DEFAULT 'saudavel',
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  predicted_next_purchase_date date, purchase_probability_7d numeric,
  purchase_probability_15d numeric, purchase_probability_30d numeric,
  ideal_offer_window_start integer, ideal_offer_window_end integer
);
CREATE UNIQUE INDEX idx_rfm_integration_customer_date ON public.customer_rfm_snapshots(integration_id, customer_id, reference_date);

CREATE TABLE public.customer_rfm_category_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, integration_id uuid NOT NULL,
  source_type text NOT NULL, customer_id text NOT NULL, customer_name text,
  category_name text NOT NULL, last_order_date timestamptz,
  recency_days integer, orders_count integer, revenue_total numeric, aov numeric,
  r_score integer, f_score integer, m_score integer, rfm_score text, segment_name text,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rfm_audiences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, integration_id uuid NOT NULL,
  name text NOT NULL, description text, rules jsonb NOT NULL DEFAULT '{}',
  member_count integer NOT NULL DEFAULT 0, total_revenue numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, last_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rfm_audience_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id uuid NOT NULL REFERENCES public.rfm_audiences(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.customer_rfm_snapshots(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rfm_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, integration_id uuid NOT NULL,
  alert_type text NOT NULL, title text NOT NULL, description text NOT NULL,
  severity text NOT NULL DEFAULT 'warning', reference_date text NOT NULL,
  metadata jsonb DEFAULT '{}', is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
