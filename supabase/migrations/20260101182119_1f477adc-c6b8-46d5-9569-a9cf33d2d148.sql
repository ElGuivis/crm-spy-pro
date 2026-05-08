-- Create table to track AI provider health status
CREATE TABLE public.ai_provider_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'google', 'lovable')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'error', 'unknown')),
  last_error_code TEXT,
  last_error_message TEXT,
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- Enable RLS
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view their own provider health" 
ON public.ai_provider_health 
FOR SELECT 
USING (
  tenant_id IN (
    SELECT tenant_id FROM team_members WHERE user_id = auth.uid()
  ) OR 
  tenant_id IN (
    SELECT id FROM tenants WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage provider health" 
ON public.ai_provider_health 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_ai_provider_health_tenant ON public.ai_provider_health(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_provider_health_updated_at
BEFORE UPDATE ON public.ai_provider_health
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();