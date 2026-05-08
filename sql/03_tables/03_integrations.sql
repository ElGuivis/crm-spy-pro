-- =============================================================================
-- TABELAS DE INTEGRAÇÕES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- INTEGRATIONS (Integrações Gerais)
-- -----------------------------------------------------------------------------
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'loja_integrada', 'evolution_whatsapp', 'bling', 'melhor_envio'
  name TEXT NOT NULL,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Configurações de auto-sync
  auto_sync_enabled BOOLEAN DEFAULT true,
  auto_sync_interval_minutes INTEGER DEFAULT 5,
  last_auto_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Flags de auto-sync por tipo
  auto_sync_orders BOOLEAN DEFAULT true,
  auto_sync_orders_interval INTEGER DEFAULT 5,
  auto_sync_customers BOOLEAN DEFAULT true,
  auto_sync_customers_interval INTEGER DEFAULT 5,
  auto_sync_products BOOLEAN DEFAULT true,
  auto_sync_products_interval INTEGER DEFAULT 5,
  auto_sync_carts BOOLEAN DEFAULT true,
  auto_sync_carts_interval INTEGER DEFAULT 5,
  auto_sync_coupons BOOLEAN DEFAULT true,
  auto_sync_coupons_interval INTEGER DEFAULT 5,
  auto_sync_shipments BOOLEAN DEFAULT true,
  auto_sync_shipments_interval INTEGER DEFAULT 5,
  
  -- Timestamps de última sincronização
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_orders_at TIMESTAMP WITH TIME ZONE,
  last_sync_customers_at TIMESTAMP WITH TIME ZONE,
  last_sync_products_at TIMESTAMP WITH TIME ZONE,
  last_sync_carts_at TIMESTAMP WITH TIME ZONE,
  last_sync_coupons_at TIMESTAMP WITH TIME ZONE,
  last_sync_shipments_at TIMESTAMP WITH TIME ZONE,
  last_orders_sync_at TIMESTAMP WITH TIME ZONE,
  last_customers_sync_at TIMESTAMP WITH TIME ZONE,
  last_products_sync_at TIMESTAMP WITH TIME ZONE,
  last_carts_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Bling específico
  bling_store_ids INTEGER[],
  initial_sync_completed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.integrations IS 'Integrações com sistemas externos';
COMMENT ON COLUMN public.integrations.type IS 'Tipo: loja_integrada, evolution_whatsapp, bling, melhor_envio, meta, chatwoot';

-- -----------------------------------------------------------------------------
-- EMAIL_INTEGRATIONS (Integrações de Email SMTP)
-- -----------------------------------------------------------------------------
CREATE TABLE public.email_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_integrations IS 'Configurações de SMTP para envio de emails';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_integrations_tenant_id ON public.integrations(tenant_id);
CREATE INDEX idx_integrations_type ON public.integrations(type);
CREATE INDEX idx_integrations_tenant_type ON public.integrations(tenant_id, type);
CREATE INDEX idx_email_integrations_tenant_id ON public.email_integrations(tenant_id);
