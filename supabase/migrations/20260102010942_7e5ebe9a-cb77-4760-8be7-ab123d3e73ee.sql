-- Tabela para armazenar tokens OAuth do Melhor Envio
CREATE TABLE public.melhor_envio_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  environment TEXT DEFAULT 'production',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

-- RLS para melhor_envio_tokens
ALTER TABLE public.melhor_envio_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage melhor_envio_tokens"
ON public.melhor_envio_tokens
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant members can view melhor_envio_tokens"
ON public.melhor_envio_tokens
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Tabela para envios sincronizados do Melhor Envio
CREATE TABLE public.me_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  me_id TEXT NOT NULL,
  order_id UUID REFERENCES public.li_orders(id) ON DELETE SET NULL,
  order_number TEXT,
  protocol TEXT,
  tracking_code TEXT,
  service_name TEXT,
  carrier TEXT,
  status TEXT DEFAULT 'pending',
  price DECIMAL(10,2),
  discount DECIMAL(10,2),
  insurance_value DECIMAL(10,2),
  format TEXT,
  weight DECIMAL(10,3),
  width INTEGER,
  height INTEGER,
  length INTEGER,
  receipt BOOLEAN DEFAULT false,
  own_hand BOOLEAN DEFAULT false,
  collect BOOLEAN DEFAULT false,
  from_address JSONB,
  to_address JSONB,
  tracking_events JSONB DEFAULT '[]'::jsonb,
  last_tracking_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, me_id)
);

-- RLS para me_shipments
ALTER TABLE public.me_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage me_shipments"
ON public.me_shipments
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND has_module_permission(auth.uid(), 'sales'::module_permission, true)
);

CREATE POLICY "Tenant members can view me_shipments"
ON public.me_shipments
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND has_module_permission(auth.uid(), 'sales'::module_permission)
);

-- Índices para performance
CREATE INDEX idx_me_shipments_tenant ON public.me_shipments(tenant_id);
CREATE INDEX idx_me_shipments_tracking ON public.me_shipments(tracking_code);
CREATE INDEX idx_me_shipments_status ON public.me_shipments(status);
CREATE INDEX idx_me_shipments_order ON public.me_shipments(order_id);
CREATE INDEX idx_me_shipments_order_number ON public.me_shipments(order_number);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_melhor_envio_tokens_updated_at
  BEFORE UPDATE ON public.melhor_envio_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_me_shipments_updated_at
  BEFORE UPDATE ON public.me_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();