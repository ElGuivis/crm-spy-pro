-- =============================================================================
-- TABELAS DE EVENTOS DE WEBHOOK E SYNC STATE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LI_SYNC_STATE (Estado de Sincronização Incremental LI)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'orders', 'customers', 'products'
  last_cursor TEXT,
  last_offset INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  records_synced INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, entity_type)
);

COMMENT ON TABLE public.li_sync_state IS 'Estado de sincronização incremental por entidade LI';

-- -----------------------------------------------------------------------------
-- LI_WEBHOOK_EVENTS (Eventos Webhook da Loja Integrada)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload_json JSONB,
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'received', -- 'received', 'processing', 'processed', 'failed'
  error TEXT,
  dedupe_key TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(dedupe_key)
);

COMMENT ON TABLE public.li_webhook_events IS 'Eventos recebidos do webhook da Loja Integrada';

-- -----------------------------------------------------------------------------
-- OAUTH_STATES (Estados OAuth para fluxos de autorização)
-- -----------------------------------------------------------------------------
CREATE TABLE public.oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta', -- 'meta', 'bling', 'melhor_envio'
  redirect_path TEXT DEFAULT '/integrations',
  frontend_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.oauth_states IS 'Estados temporários para fluxos OAuth';

-- -----------------------------------------------------------------------------
-- WEBHOOK_EVENTS (Eventos de Webhook Gerais)
-- -----------------------------------------------------------------------------
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'evolution', 'meta', etc
  channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'processed', 'failed'
  error_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_events IS 'Eventos de webhook genéricos para auditoria';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_li_sync_state_integration ON public.li_sync_state(integration_id);
CREATE INDEX idx_li_sync_state_tenant ON public.li_sync_state(tenant_id);

CREATE INDEX idx_li_webhook_events_status ON public.li_webhook_events(status);
CREATE INDEX idx_li_webhook_events_dedupe ON public.li_webhook_events(dedupe_key);
CREATE INDEX idx_li_webhook_events_tenant ON public.li_webhook_events(tenant_id);

CREATE INDEX idx_oauth_states_state ON public.oauth_states(state);
CREATE INDEX idx_oauth_states_tenant ON public.oauth_states(tenant_id);
CREATE INDEX idx_oauth_states_expires ON public.oauth_states(expires_at);

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events(tenant_id);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(processing_status);
CREATE INDEX idx_webhook_events_provider ON public.webhook_events(provider);
CREATE INDEX idx_webhook_events_channel ON public.webhook_events(channel_id);
