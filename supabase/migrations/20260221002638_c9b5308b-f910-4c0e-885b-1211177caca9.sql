
-- Table for saved RFM audience rules
CREATE TABLE public.rfm_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rfm_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant rfm_audiences"
  ON public.rfm_audiences FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant rfm_audiences"
  ON public.rfm_audiences FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant rfm_audiences"
  ON public.rfm_audiences FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant rfm_audiences"
  ON public.rfm_audiences FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Table for audience members (linked to latest snapshot)
CREATE TABLE public.rfm_audience_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id UUID NOT NULL REFERENCES public.rfm_audiences(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rfm_audience_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant rfm_audience_members"
  ON public.rfm_audience_members FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can manage their tenant rfm_audience_members"
  ON public.rfm_audience_members FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX idx_rfm_audiences_tenant ON public.rfm_audiences(tenant_id, integration_id);
CREATE INDEX idx_rfm_audience_members_audience ON public.rfm_audience_members(audience_id);

-- Trigger for updated_at
CREATE TRIGGER update_rfm_audiences_updated_at
  BEFORE UPDATE ON public.rfm_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
