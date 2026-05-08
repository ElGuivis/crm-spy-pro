
-- Create customer_rfm_snapshots table
CREATE TABLE public.customer_rfm_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_doc TEXT,
  last_order_date TIMESTAMPTZ,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC DEFAULT 0,
  aov NUMERIC DEFAULT 0,
  avg_order_interval_days NUMERIC,
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  segment_name TEXT,
  segment_action TEXT,
  churn_risk TEXT DEFAULT 'saudavel',
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index per integration/customer/date
CREATE UNIQUE INDEX idx_rfm_integration_customer_date 
ON public.customer_rfm_snapshots(integration_id, customer_id, reference_date);

-- Index for tenant queries
CREATE INDEX idx_rfm_tenant ON public.customer_rfm_snapshots(tenant_id);
CREATE INDEX idx_rfm_segment ON public.customer_rfm_snapshots(integration_id, segment_name);

-- Enable RLS
ALTER TABLE public.customer_rfm_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own tenant RFM data"
ON public.customer_rfm_snapshots FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert own tenant RFM data"
ON public.customer_rfm_snapshots FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own tenant RFM data"
ON public.customer_rfm_snapshots FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete own tenant RFM data"
ON public.customer_rfm_snapshots FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_rfm_snapshots_updated_at
BEFORE UPDATE ON public.customer_rfm_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
