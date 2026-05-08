ALTER TABLE public.tenant_ai_credentials ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Ensure only one default per tenant via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_ai_credentials_one_default 
ON public.tenant_ai_credentials (tenant_id) WHERE is_default = true;