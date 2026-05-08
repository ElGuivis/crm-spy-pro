
-- Table for category-level RFM snapshots
CREATE TABLE public.customer_rfm_category_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  category_name TEXT NOT NULL,
  last_order_date TIMESTAMPTZ,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC(12,2),
  aov NUMERIC(12,2),
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  segment_name TEXT,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_crfm_cat_integration_date ON public.customer_rfm_category_snapshots(integration_id, reference_date);
CREATE INDEX idx_crfm_cat_category ON public.customer_rfm_category_snapshots(category_name);
CREATE INDEX idx_crfm_cat_tenant ON public.customer_rfm_category_snapshots(tenant_id);
CREATE INDEX idx_crfm_cat_segment ON public.customer_rfm_category_snapshots(segment_name);

-- RLS
ALTER TABLE public.customer_rfm_category_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policy for edge functions
CREATE POLICY "Service role full access to category RFM"
  ON public.customer_rfm_category_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_crfm_category_updated_at
  BEFORE UPDATE ON public.customer_rfm_category_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
