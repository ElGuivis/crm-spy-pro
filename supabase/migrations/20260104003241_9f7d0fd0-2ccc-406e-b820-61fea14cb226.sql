-- =============================================
-- BLING ERP - TABELAS ISOLADAS DE DADOS
-- =============================================

-- Tabela de pedidos do Bling
CREATE TABLE public.bling_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  numero TEXT NOT NULL,
  data_criacao TIMESTAMPTZ,
  data_modificacao TIMESTAMPTZ,
  situacao_id INTEGER,
  situacao_nome TEXT,
  cliente_id BIGINT,
  cliente_nome TEXT,
  cliente_cpf_cnpj TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  valor_total NUMERIC(12,2),
  valor_desconto NUMERIC(12,2),
  valor_frete NUMERIC(12,2),
  valor_produtos NUMERIC(12,2),
  forma_pagamento TEXT,
  forma_envio TEXT,
  observacoes TEXT,
  observacoes_internas TEXT,
  endereco_entrega JSONB,
  loja_id BIGINT,
  loja_nome TEXT,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de itens de pedido do Bling
CREATE TABLE public.bling_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.bling_orders(id) ON DELETE CASCADE,
  bling_id BIGINT,
  produto_id BIGINT,
  produto_nome TEXT,
  sku TEXT,
  quantidade NUMERIC(12,4),
  valor_unitario NUMERIC(12,2),
  valor_total NUMERIC(12,2),
  desconto NUMERIC(12,2),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de clientes/contatos do Bling
CREATE TABLE public.bling_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  nome TEXT NOT NULL,
  fantasia TEXT,
  tipo_pessoa TEXT,
  cpf_cnpj TEXT,
  ie TEXT,
  email TEXT,
  telefone TEXT,
  celular TEXT,
  endereco JSONB,
  situacao TEXT,
  data_inclusao TIMESTAMPTZ,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de produtos do Bling
CREATE TABLE public.bling_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  nome TEXT NOT NULL,
  codigo TEXT,
  preco NUMERIC(12,2),
  preco_custo NUMERIC(12,2),
  estoque_atual NUMERIC(12,4),
  estoque_minimo NUMERIC(12,4),
  tipo TEXT,
  situacao TEXT,
  formato TEXT,
  descricao_curta TEXT,
  descricao_completa TEXT,
  unidade TEXT,
  peso_liquido NUMERIC(12,4),
  peso_bruto NUMERIC(12,4),
  gtin TEXT,
  imagem_url TEXT,
  categoria_id BIGINT,
  categoria_nome TEXT,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de logs de sincronização do Bling
CREATE TABLE public.bling_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de jobs de sincronização do Bling
CREATE TABLE public.bling_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID NOT NULL REFERENCES public.bling_sync_logs(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  current_page INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índices para bling_orders
CREATE INDEX idx_bling_orders_integration_id ON public.bling_orders(integration_id);
CREATE INDEX idx_bling_orders_tenant_id ON public.bling_orders(tenant_id);
CREATE INDEX idx_bling_orders_bling_id ON public.bling_orders(bling_id);
CREATE INDEX idx_bling_orders_data_criacao ON public.bling_orders(data_criacao DESC);
CREATE INDEX idx_bling_orders_situacao ON public.bling_orders(situacao_nome);
CREATE INDEX idx_bling_orders_loja_id ON public.bling_orders(loja_id);

-- Índices para bling_order_items
CREATE INDEX idx_bling_order_items_order_id ON public.bling_order_items(order_id);
CREATE INDEX idx_bling_order_items_tenant_id ON public.bling_order_items(tenant_id);

-- Índices para bling_customers
CREATE INDEX idx_bling_customers_integration_id ON public.bling_customers(integration_id);
CREATE INDEX idx_bling_customers_tenant_id ON public.bling_customers(tenant_id);
CREATE INDEX idx_bling_customers_bling_id ON public.bling_customers(bling_id);
CREATE INDEX idx_bling_customers_nome ON public.bling_customers(nome);
CREATE INDEX idx_bling_customers_cpf_cnpj ON public.bling_customers(cpf_cnpj);

-- Índices para bling_products
CREATE INDEX idx_bling_products_integration_id ON public.bling_products(integration_id);
CREATE INDEX idx_bling_products_tenant_id ON public.bling_products(tenant_id);
CREATE INDEX idx_bling_products_bling_id ON public.bling_products(bling_id);
CREATE INDEX idx_bling_products_codigo ON public.bling_products(codigo);
CREATE INDEX idx_bling_products_nome ON public.bling_products(nome);

-- Índices para bling_sync_logs
CREATE INDEX idx_bling_sync_logs_integration_id ON public.bling_sync_logs(integration_id);
CREATE INDEX idx_bling_sync_logs_tenant_id ON public.bling_sync_logs(tenant_id);
CREATE INDEX idx_bling_sync_logs_status ON public.bling_sync_logs(status);

-- Índices para bling_sync_jobs
CREATE INDEX idx_bling_sync_jobs_integration_id ON public.bling_sync_jobs(integration_id);
CREATE INDEX idx_bling_sync_jobs_tenant_id ON public.bling_sync_jobs(tenant_id);
CREATE INDEX idx_bling_sync_jobs_status ON public.bling_sync_jobs(status);
CREATE INDEX idx_bling_sync_jobs_sync_log_id ON public.bling_sync_jobs(sync_log_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS
ALTER TABLE public.bling_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policies for bling_orders
CREATE POLICY "Users can view their tenant bling_orders"
  ON public.bling_orders FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_orders"
  ON public.bling_orders FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_orders"
  ON public.bling_orders FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_orders"
  ON public.bling_orders FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_order_items
CREATE POLICY "Users can view their tenant bling_order_items"
  ON public.bling_order_items FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_order_items"
  ON public.bling_order_items FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_order_items"
  ON public.bling_order_items FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_order_items"
  ON public.bling_order_items FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_customers
CREATE POLICY "Users can view their tenant bling_customers"
  ON public.bling_customers FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_customers"
  ON public.bling_customers FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_customers"
  ON public.bling_customers FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_customers"
  ON public.bling_customers FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_products
CREATE POLICY "Users can view their tenant bling_products"
  ON public.bling_products FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_products"
  ON public.bling_products FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_products"
  ON public.bling_products FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_products"
  ON public.bling_products FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_sync_logs
CREATE POLICY "Users can view their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_sync_jobs
CREATE POLICY "Users can view their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================
-- TRIGGERS PARA UPDATED_AT
-- =============================================

CREATE TRIGGER update_bling_orders_updated_at
  BEFORE UPDATE ON public.bling_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_customers_updated_at
  BEFORE UPDATE ON public.bling_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_products_updated_at
  BEFORE UPDATE ON public.bling_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_sync_jobs_updated_at
  BEFORE UPDATE ON public.bling_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- HABILITAR REALTIME PARA TABELAS PRINCIPAIS
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_sync_jobs;