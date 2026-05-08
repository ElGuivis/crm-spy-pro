-- =============================================================================
-- TABELAS DE INBOXES E CANAIS WHATSAPP
-- =============================================================================

-- -----------------------------------------------------------------------------
-- WHATSAPP_CHANNELS (Canais WhatsApp)
-- -----------------------------------------------------------------------------
CREATE TABLE public.whatsapp_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'evolution', 'meta'
  display_name TEXT NOT NULL,
  phone_e164 TEXT,
  provider_account_id TEXT, -- Instance name (Evolution) ou Phone Number ID (Meta)
  waba_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  webhook_secret TEXT,
  access_token TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_channels IS 'Canais WhatsApp (Evolution API ou Meta Cloud API)';

-- -----------------------------------------------------------------------------
-- INBOXES (Caixas de Entrada)
-- -----------------------------------------------------------------------------
CREATE TABLE public.inboxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  bot_enabled BOOLEAN NOT NULL DEFAULT false,
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  sla_first_response_minutes INTEGER,
  sla_resolution_minutes INTEGER,
  business_hours_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inboxes IS 'Caixas de entrada para organização de atendimentos';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_whatsapp_channels_tenant_id ON public.whatsapp_channels(tenant_id);
CREATE INDEX idx_whatsapp_channels_status ON public.whatsapp_channels(status);
CREATE INDEX idx_whatsapp_channels_integration_id ON public.whatsapp_channels(integration_id);
CREATE INDEX idx_inboxes_tenant_id ON public.inboxes(tenant_id);
CREATE INDEX idx_inboxes_channel_id ON public.inboxes(channel_id);
