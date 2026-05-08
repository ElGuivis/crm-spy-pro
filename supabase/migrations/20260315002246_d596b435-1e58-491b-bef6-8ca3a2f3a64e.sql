
-- 1. Create email_integration_senders table
CREATE TABLE public.email_integration_senders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.email_integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_integration_senders_integration ON public.email_integration_senders(integration_id);
CREATE INDEX idx_email_integration_senders_tenant ON public.email_integration_senders(tenant_id);

ALTER TABLE public.email_integration_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for email_integration_senders"
  ON public.email_integration_senders
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. Add email_integration_id to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS email_integration_id UUID REFERENCES public.email_integrations(id);

-- 3. Add sender_email to email_campaign_logs
ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS sender_email TEXT;
