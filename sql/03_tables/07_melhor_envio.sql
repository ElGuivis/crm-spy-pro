-- =============================================================================
-- TABELAS MELHOR ENVIO - Tokens, Envios e Auto-Sync
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MELHOR_ENVIO_TOKENS (Tokens OAuth do Melhor Envio)
-- -----------------------------------------------------------------------------
CREATE TABLE public.melhor_envio_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  environment TEXT DEFAULT 'production',
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.melhor_envio_tokens IS 'Tokens OAuth do Melhor Envio por tenant';

-- -----------------------------------------------------------------------------
-- ME_SHIPMENTS (Envios do Melhor Envio)
-- -----------------------------------------------------------------------------
CREATE TABLE public.me_shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  me_id TEXT NOT NULL,
  status TEXT,
  tracking_code TEXT,
  protocol TEXT,
  order_id TEXT,
  order_number TEXT,
  external_order_number TEXT,
  li_order_id UUID,
  bling_order_id UUID,
  carrier TEXT,
  service_name TEXT,
  service_details JSONB,
  contract TEXT,
  price NUMERIC,
  quote NUMERIC,
  discount NUMERIC,
  insurance_value NUMERIC,
  weight NUMERIC,
  height NUMERIC,
  width NUMERIC,
  length NUMERIC,
  billed_weight NUMERIC,
  format TEXT,
  dimensions JSONB,
  volumes JSONB,
  sender_name TEXT,
  sender_email TEXT,
  sender_phone TEXT,
  sender_document TEXT,
  from_address JSONB,
  receiver_name TEXT,
  receiver_email TEXT,
  receiver_phone TEXT,
  receiver_document TEXT,
  receiver_city TEXT,
  receiver_state TEXT,
  receiver_note TEXT,
  receiver_address JSONB,
  to_address JSONB,
  delivery_min INTEGER,
  delivery_max INTEGER,
  estimated_delivery_at TIMESTAMP WITH TIME ZONE,
  generated_at TIMESTAMP WITH TIME ZONE,
  posted_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE,
  preview_url TEXT,
  print_url TEXT,
  tracking_events JSONB,
  last_tracking_at TIMESTAMP WITH TIME ZONE,
  collect BOOLEAN DEFAULT false,
  agency_name TEXT,
  agency_address JSONB,
  own_hand BOOLEAN DEFAULT false,
  receipt BOOLEAN DEFAULT false,
  non_commercial BOOLEAN DEFAULT false,
  authorization_code TEXT,
  cte_key TEXT,
  invoice JSONB,
  products JSONB,
  tags JSONB,
  financial_details JSONB,
  conciliation JSONB,
  additional_info JSONB,
  raw_data JSONB,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, me_id)
);

COMMENT ON TABLE public.me_shipments IS 'Envios sincronizados do Melhor Envio';

-- Adicionar FK para li_orders
ALTER TABLE public.me_shipments 
ADD CONSTRAINT me_shipments_li_order_id_fkey 
FOREIGN KEY (li_order_id) REFERENCES public.li_orders(id) ON DELETE SET NULL;

-- Adicionar FK para bling_orders
ALTER TABLE public.me_shipments 
ADD CONSTRAINT me_shipments_bling_order_id_fkey 
FOREIGN KEY (bling_order_id) REFERENCES public.bling_orders(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- ME_SYNC_JOBS (Jobs de Sincronização Melhor Envio)
-- -----------------------------------------------------------------------------
CREATE TABLE public.me_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  current_page INTEGER DEFAULT 1,
  total_pages INTEGER,
  items_total INTEGER,
  items_saved INTEGER DEFAULT 0,
  items_linked INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.me_sync_jobs IS 'Jobs de sincronização do Melhor Envio';

-- -----------------------------------------------------------------------------
-- ME_AUTO_SYNC_CONFIGS (Configuração de Auto-Sync Melhor Envio)
-- -----------------------------------------------------------------------------
CREATE TABLE public.me_auto_sync_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'shipments',
  is_active BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, sync_type)
);

COMMENT ON TABLE public.me_auto_sync_configs IS 'Configuração de sincronização automática Melhor Envio';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_melhor_envio_tokens_tenant_id ON public.melhor_envio_tokens(tenant_id);

CREATE INDEX idx_me_shipments_tenant_id ON public.me_shipments(tenant_id);
CREATE INDEX idx_me_shipments_me_id ON public.me_shipments(me_id);
CREATE INDEX idx_me_shipments_status ON public.me_shipments(status);
CREATE INDEX idx_me_shipments_tracking_code ON public.me_shipments(tracking_code);
CREATE INDEX idx_me_shipments_order_number ON public.me_shipments(order_number);
CREATE INDEX idx_me_shipments_li_order_id ON public.me_shipments(li_order_id);
CREATE INDEX idx_me_shipments_bling_order_id ON public.me_shipments(bling_order_id);
CREATE INDEX idx_me_shipments_receiver ON public.me_shipments(receiver_name);
CREATE INDEX idx_me_shipments_external_order ON public.me_shipments(external_order_number);
CREATE INDEX idx_me_shipments_created ON public.me_shipments(created_at DESC);

CREATE INDEX idx_me_sync_jobs_tenant_id ON public.me_sync_jobs(tenant_id);
CREATE INDEX idx_me_sync_jobs_status ON public.me_sync_jobs(status);

CREATE INDEX idx_me_auto_sync_configs_tenant_id ON public.me_auto_sync_configs(tenant_id);
CREATE INDEX idx_me_auto_sync_configs_integration_id ON public.me_auto_sync_configs(integration_id);
