-- =============================================================================
-- TABELAS LOJA INTEGRADA - Pedidos, Clientes, Produtos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LI_CUSTOMERS (Clientes da Loja Integrada)
-- Formato simplificado com JSONB
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  loja_integrada_customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  doc TEXT, -- CPF/CNPJ
  address_json JSONB,
  raw_json JSONB,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  UNIQUE(integration_id, loja_integrada_customer_id)
);

COMMENT ON TABLE public.li_customers IS 'Clientes sincronizados da Loja Integrada';

-- Adicionar FK de contacts para li_customers
ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_li_customer_id_fkey 
FOREIGN KEY (li_customer_id) REFERENCES public.li_customers(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- LI_ORDERS (Pedidos da Loja Integrada - Formato JSONB)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  loja_integrada_order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  
  -- Status
  status_id INTEGER,
  status_name TEXT,
  
  -- Cliente (referência)
  customer_id UUID REFERENCES public.li_customers(id) ON DELETE SET NULL,
  
  -- Dados JSONB consolidados
  totals_json JSONB,    -- valor_subtotal, valor_total, valor_frete, valor_desconto, etc
  shipping_json JSONB,  -- forma_envio, codigo_rastreio, endereco_entrega, etc
  payment_json JSONB,   -- forma_pagamento, gateway, parcelas, etc
  items_json JSONB,     -- array de itens do pedido
  raw_json JSONB,       -- dados brutos completos da API
  
  -- Datas remotas
  created_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  
  -- Controle local
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_status_check_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(integration_id, loja_integrada_order_id)
);

COMMENT ON TABLE public.li_orders IS 'Pedidos sincronizados da Loja Integrada (formato JSONB)';

-- -----------------------------------------------------------------------------
-- LI_ORDER_ITEMS (Itens dos Pedidos - formato simplificado)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER,
  sku TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC,
  raw_json JSONB
);

COMMENT ON TABLE public.li_order_items IS 'Itens dos pedidos da Loja Integrada';

-- -----------------------------------------------------------------------------
-- LI_PRODUCTS (Produtos da Loja Integrada - formato simplificado)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  active BOOLEAN DEFAULT true,
  
  -- Preços
  price NUMERIC,
  promotional_price NUMERIC,
  cost_price NUMERIC,
  
  -- Estoque
  stock_managed BOOLEAN DEFAULT false,
  stock INTEGER,
  
  -- Mídia
  image_url TEXT,
  
  -- Variações
  variations_json JSONB,
  
  -- Dados brutos
  raw_json JSONB,
  
  -- Timestamps
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(integration_id, loja_integrada_product_id)
);

COMMENT ON TABLE public.li_products IS 'Produtos sincronizados da Loja Integrada';

-- -----------------------------------------------------------------------------
-- LI_SYNC_LOGS (Logs de Sincronização)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'orders', 'customers', 'products', 'carts', 'coupons'
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  records_synced INTEGER,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.li_sync_logs IS 'Logs de sincronização com Loja Integrada';

-- -----------------------------------------------------------------------------
-- LI_SYNC_JOBS (Jobs de Sincronização Assíncrona)
-- -----------------------------------------------------------------------------
CREATE TABLE public.li_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  sync_log_id UUID REFERENCES public.li_sync_logs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'orders', 'customers', 'products'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  current_offset INTEGER DEFAULT 0,
  total_count INTEGER,
  processed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.li_sync_jobs IS 'Jobs de sincronização assíncrona LI';

-- NOTA: li_sync_state e li_webhook_events estão definidos em 18_webhook_events.sql
-- para evitar duplicação de tabelas.

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_li_customers_tenant_id ON public.li_customers(tenant_id);
CREATE INDEX idx_li_customers_integration_id ON public.li_customers(integration_id);
CREATE INDEX idx_li_customers_li_id ON public.li_customers(loja_integrada_customer_id);
CREATE INDEX idx_li_customers_doc ON public.li_customers(doc);

CREATE INDEX idx_li_orders_tenant_id ON public.li_orders(tenant_id);
CREATE INDEX idx_li_orders_integration_id ON public.li_orders(integration_id);
CREATE INDEX idx_li_orders_li_id ON public.li_orders(loja_integrada_order_id);
CREATE INDEX idx_li_orders_numero ON public.li_orders(order_number);
CREATE INDEX idx_li_orders_status ON public.li_orders(tenant_id, status_name);
CREATE INDEX idx_li_orders_customer_id ON public.li_orders(customer_id);

CREATE INDEX idx_li_order_items_order_id ON public.li_order_items(order_id);

CREATE INDEX idx_li_products_tenant_id ON public.li_products(tenant_id);
CREATE INDEX idx_li_products_integration_id ON public.li_products(integration_id);
CREATE INDEX idx_li_products_li_id ON public.li_products(loja_integrada_product_id);
CREATE INDEX idx_li_products_sku ON public.li_products(sku);

CREATE INDEX idx_li_sync_logs_tenant_id ON public.li_sync_logs(tenant_id);
CREATE INDEX idx_li_sync_logs_integration_id ON public.li_sync_logs(integration_id);
CREATE INDEX idx_li_sync_jobs_status ON public.li_sync_jobs(status);
