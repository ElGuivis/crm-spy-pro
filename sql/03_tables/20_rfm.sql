-- =============================================================================
-- TABELAS DE RFM - Snapshots, Categorias, Audiências, Alertas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CUSTOMER_RFM_SNAPSHOTS (Snapshots RFM de Clientes)
-- -----------------------------------------------------------------------------
CREATE TABLE public.customer_rfm_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  
  -- Identificação do cliente
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_doc TEXT,
  source_type TEXT NOT NULL, -- 'li', 'bling'
  
  -- Métricas RFM
  last_order_date TIMESTAMP WITH TIME ZONE,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC DEFAULT 0,
  aov NUMERIC DEFAULT 0,
  avg_order_interval_days NUMERIC,
  
  -- Scores
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  
  -- Segmentação
  segment_name TEXT,
  segment_action TEXT,
  churn_risk TEXT DEFAULT 'saudavel',
  
  -- Predições
  predicted_next_purchase_date DATE,
  purchase_probability_7d NUMERIC,
  purchase_probability_15d NUMERIC,
  purchase_probability_30d NUMERIC,
  ideal_offer_window_start INTEGER,
  ideal_offer_window_end INTEGER,
  
  -- Controle
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_rfm_snapshots IS 'Snapshots de análise RFM por cliente';

-- -----------------------------------------------------------------------------
-- CUSTOMER_RFM_CATEGORY_SNAPSHOTS (Snapshots RFM por Categoria)
-- -----------------------------------------------------------------------------
CREATE TABLE public.customer_rfm_category_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  
  -- Identificação
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  source_type TEXT NOT NULL,
  category_name TEXT NOT NULL,
  
  -- Métricas
  last_order_date TIMESTAMP WITH TIME ZONE,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC,
  aov NUMERIC,
  
  -- Scores
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  segment_name TEXT,
  
  -- Controle
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_rfm_category_snapshots IS 'Snapshots RFM segmentados por categoria de produto';

-- -----------------------------------------------------------------------------
-- RFM_AUDIENCES (Audiências RFM)
-- -----------------------------------------------------------------------------
CREATE TABLE public.rfm_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  member_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rfm_audiences IS 'Audiências personalizadas baseadas em RFM';

-- -----------------------------------------------------------------------------
-- RFM_AUDIENCE_MEMBERS (Membros de Audiências RFM)
-- -----------------------------------------------------------------------------
CREATE TABLE public.rfm_audience_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id UUID NOT NULL REFERENCES public.rfm_audiences(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.customer_rfm_snapshots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rfm_audience_members IS 'Membros de cada audiência RFM';

-- -----------------------------------------------------------------------------
-- RFM_ALERTS (Alertas RFM)
-- -----------------------------------------------------------------------------
CREATE TABLE public.rfm_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  reference_date TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rfm_alerts IS 'Alertas gerados pela análise RFM';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_rfm_snapshots_tenant_id ON public.customer_rfm_snapshots(tenant_id);
CREATE INDEX idx_rfm_snapshots_integration_id ON public.customer_rfm_snapshots(integration_id);
CREATE INDEX idx_rfm_snapshots_customer_id ON public.customer_rfm_snapshots(customer_id);
CREATE INDEX idx_rfm_snapshots_reference_date ON public.customer_rfm_snapshots(reference_date);
CREATE INDEX idx_rfm_snapshots_segment ON public.customer_rfm_snapshots(segment_name);

CREATE INDEX idx_rfm_category_snapshots_tenant_id ON public.customer_rfm_category_snapshots(tenant_id);
CREATE INDEX idx_rfm_category_snapshots_integration_id ON public.customer_rfm_category_snapshots(integration_id);
CREATE INDEX idx_rfm_category_snapshots_category ON public.customer_rfm_category_snapshots(category_name);

CREATE INDEX idx_rfm_audiences_tenant_id ON public.rfm_audiences(tenant_id);
CREATE INDEX idx_rfm_audiences_integration_id ON public.rfm_audiences(integration_id);

CREATE INDEX idx_rfm_audience_members_audience_id ON public.rfm_audience_members(audience_id);
CREATE INDEX idx_rfm_audience_members_tenant_id ON public.rfm_audience_members(tenant_id);

CREATE INDEX idx_rfm_alerts_tenant_id ON public.rfm_alerts(tenant_id);
CREATE INDEX idx_rfm_alerts_integration_id ON public.rfm_alerts(integration_id);
CREATE INDEX idx_rfm_alerts_is_read ON public.rfm_alerts(is_read);