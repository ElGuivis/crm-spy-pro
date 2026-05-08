-- =============================================================================
-- TABELAS DE CAMPANHAS EM MASSA
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BULK_CAMPAIGNS (Campanhas de Envio em Massa)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  delay_seconds INTEGER NOT NULL DEFAULT 10,
  delay_max_seconds INTEGER DEFAULT 360,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'
  tokens_per_message INTEGER NOT NULL DEFAULT 2,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  media_url TEXT,
  media_type TEXT DEFAULT 'text',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  sending_schedule JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bulk_campaigns IS 'Campanhas de envio em massa via WhatsApp';

-- -----------------------------------------------------------------------------
-- CAMPAIGN_CONTACTS (Contatos das Campanhas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  whatsapp_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaign_contacts IS 'Contatos de cada campanha em massa';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_bulk_campaigns_tenant_id ON public.bulk_campaigns(tenant_id);
CREATE INDEX idx_bulk_campaigns_status ON public.bulk_campaigns(status);
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_tenant_id ON public.campaign_contacts(tenant_id);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts(status);
