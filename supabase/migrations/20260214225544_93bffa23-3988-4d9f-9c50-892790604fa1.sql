
-- Remover tabelas da publicação realtime (sem IF EXISTS)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_orders;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_products;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_customers;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END$$;

-- Remover FK de contacts para li_customers
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_li_customer_id_fkey;

-- Drop tabelas antigas
DROP TABLE IF EXISTS public.li_order_items CASCADE;
DROP TABLE IF EXISTS public.li_orders CASCADE;
DROP TABLE IF EXISTS public.li_customers CASCADE;
DROP TABLE IF EXISTS public.li_products CASCADE;
DROP TABLE IF EXISTS public.li_sync_jobs CASCADE;
DROP TABLE IF EXISTS public.li_sync_logs CASCADE;

-- li_sync_state
CREATE TABLE public.li_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  last_cursor TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  records_synced INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, entity_type)
);
ALTER TABLE public.li_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_sync_state_select" ON public.li_sync_state FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "li_sync_state_all" ON public.li_sync_state FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- li_webhook_events
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
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.li_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_webhook_events_select" ON public.li_webhook_events FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_webhook_events_status ON public.li_webhook_events(status);
CREATE INDEX idx_li_webhook_events_integration ON public.li_webhook_events(integration_id);
CREATE INDEX idx_li_webhook_events_received ON public.li_webhook_events(received_at DESC);

-- li_customers
CREATE TABLE public.li_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  doc TEXT,
  address_json JSONB,
  raw_json JSONB,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_customer_id)
);
ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_customers_select" ON public.li_customers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_customers_tenant ON public.li_customers(tenant_id);
CREATE INDEX idx_li_customers_integration ON public.li_customers(integration_id);
CREATE INDEX idx_li_customers_remote_id ON public.li_customers(loja_integrada_customer_id);
CREATE INDEX idx_li_customers_doc ON public.li_customers(doc);

ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_li_customer_id_fkey 
FOREIGN KEY (li_customer_id) REFERENCES public.li_customers(id) ON DELETE SET NULL;

-- li_products
CREATE TABLE public.li_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  price NUMERIC,
  promotional_price NUMERIC,
  cost_price NUMERIC,
  stock INTEGER,
  stock_managed BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  variations_json JSONB,
  image_url TEXT,
  raw_json JSONB,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_product_id)
);
ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_products_select" ON public.li_products FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_products_tenant ON public.li_products(tenant_id);
CREATE INDEX idx_li_products_integration ON public.li_products(integration_id);
CREATE INDEX idx_li_products_remote_id ON public.li_products(loja_integrada_product_id);
CREATE INDEX idx_li_products_sku ON public.li_products(sku);

-- li_orders
CREATE TABLE public.li_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  status_id INTEGER,
  status_name TEXT,
  customer_id UUID REFERENCES public.li_customers(id) ON DELETE SET NULL,
  totals_json JSONB,
  shipping_json JSONB,
  payment_json JSONB,
  items_json JSONB,
  created_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  raw_json JSONB,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_order_id)
);
ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_orders_select" ON public.li_orders FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_orders_tenant ON public.li_orders(tenant_id);
CREATE INDEX idx_li_orders_integration ON public.li_orders(integration_id);
CREATE INDEX idx_li_orders_remote_id ON public.li_orders(loja_integrada_order_id);
CREATE INDEX idx_li_orders_number ON public.li_orders(order_number);
CREATE INDEX idx_li_orders_status ON public.li_orders(tenant_id, status_name);
CREATE INDEX idx_li_orders_created ON public.li_orders(created_at_remote DESC);

-- li_order_items
CREATE TABLE public.li_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER,
  sku TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC,
  raw_json JSONB
);
ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_order_items_select" ON public.li_order_items FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_order_items_order ON public.li_order_items(order_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_webhook_events;
