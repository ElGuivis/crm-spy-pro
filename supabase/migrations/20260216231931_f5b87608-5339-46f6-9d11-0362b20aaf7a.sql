
-- =============================================================================
-- TABELAS DE DISPAROS EM MASSA (Bulk WhatsApp Campaigns)
-- =============================================================================

-- Campanhas de disparo em massa
CREATE TABLE public.bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  
  -- WhatsApp config
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  
  -- Timing
  delay_seconds INTEGER NOT NULL DEFAULT 10,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Stats
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  
  -- Status: draft, scheduled, processing, paused, completed, cancelled
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- Tokens
  tokens_per_message INTEGER NOT NULL DEFAULT 2,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Contatos da campanha
CREATE TABLE public.campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  
  -- Variables for template (JSON with custom fields from Excel)
  variables JSONB DEFAULT '{}',
  
  -- Status: pending, sending, sent, delivered, read, failed
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  whatsapp_message_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bulk_campaigns
CREATE POLICY "Users can view their tenant campaigns"
  ON public.bulk_campaigns FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create campaigns for their tenant"
  ON public.bulk_campaigns FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant campaigns"
  ON public.bulk_campaigns FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant campaigns"
  ON public.bulk_campaigns FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for campaign_contacts
CREATE POLICY "Users can view their tenant campaign contacts"
  ON public.campaign_contacts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create campaign contacts for their tenant"
  ON public.campaign_contacts FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant campaign contacts"
  ON public.campaign_contacts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant campaign contacts"
  ON public.campaign_contacts FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX idx_bulk_campaigns_tenant_id ON public.bulk_campaigns(tenant_id);
CREATE INDEX idx_bulk_campaigns_status ON public.bulk_campaigns(status);
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts(status);
CREATE INDEX idx_campaign_contacts_tenant_id ON public.campaign_contacts(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_bulk_campaigns_updated_at
  BEFORE UPDATE ON public.bulk_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
