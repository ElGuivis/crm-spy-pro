-- Horário de funcionamento
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=domingo, 6=sábado
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's business hours"
ON public.business_hours FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage business hours"
ON public.business_hours FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- Trigger for updated_at
CREATE TRIGGER update_business_hours_updated_at
BEFORE UPDATE ON public.business_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();