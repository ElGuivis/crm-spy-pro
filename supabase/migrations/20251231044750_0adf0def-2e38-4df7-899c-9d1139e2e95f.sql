-- Create table for tenant AI credentials
CREATE TABLE public.tenant_ai_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable', 'openai', 'google')),
  api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view their own AI credentials"
ON public.tenant_ai_credentials
FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI credentials"
ON public.tenant_ai_credentials
FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can update their own AI credentials"
ON public.tenant_ai_credentials
FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can delete their own AI credentials"
ON public.tenant_ai_credentials
FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_tenant_ai_credentials_updated_at
BEFORE UPDATE ON public.tenant_ai_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.tenant_ai_credentials IS 'Stores AI provider credentials per tenant for self-hosted deployments';