
-- Create RFM alerts table
CREATE TABLE public.rfm_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'champions_drop', 'high_value_at_risk', 'repurchase_drop', 'segment_migration'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  reference_date TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rfm_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant rfm_alerts"
  ON public.rfm_alerts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant rfm_alerts"
  ON public.rfm_alerts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage rfm_alerts"
  ON public.rfm_alerts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_rfm_alerts_tenant_read ON public.rfm_alerts(tenant_id, is_read, created_at DESC);
