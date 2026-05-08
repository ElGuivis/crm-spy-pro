-- =============================================================================
-- TABELAS BLING - Conexões, Pedidos, Clientes, Produtos, Situações, Mapeamentos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BLING_CONNECTIONS (Conexões OAuth do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  bling_user_id TEXT,
  bling_user_name TEXT,
  bling_company_id TEXT,
  status TEXT DEFAULT 'active',
  created_by_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.bling_connections IS 'Conexões OAuth com o Bling ERP';

-- Unique constraint: um tenant = uma conexão Bling
CREATE UNIQUE INDEX bling_connections_tenant_id_idx ON public.bling_connections(tenant_id);

-- -----------------------------------------------------------------------------
-- BLING_SITUACOES (Cache de Situações/Status do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_situacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  situacao_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  id_herdado INTEGER,
  cor TEXT,
  modulo_id INTEGER NOT NULL,
  modulo_nome TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, situacao_id)
);

COMMENT ON TABLE public.bling_situacoes IS 'Cache de situações/status de pedidos do Bling';

-- -----------------------------------------------------------------------------
-- BLING_CODE_MAPPINGS (Mapeamento de Códigos do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_code_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL,
  original_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, mapping_type, original_code)
);

COMMENT ON TABLE public.bling_code_mappings IS 'Mapeamento de códigos do Bling para nomes amigáveis';

-- -----------------------------------------------------------------------------
-- BLING_CUSTOMERS (Clientes do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  bling_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  fantasia TEXT,
  tipo_pessoa TEXT,
  cpf_cnpj TEXT,
  ie TEXT,
  rg TEXT,
  orgao_emissor TEXT,
  email TEXT,
  telefone TEXT,
  celular TEXT,
  endereco JSONB,
  data_nascimento TEXT,
  sexo TEXT,
  naturalidade TEXT,
  situacao TEXT,
  data_inclusao TEXT,
  raw_data JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

COMMENT ON TABLE public.bling_customers IS 'Clientes sincronizados do Bling';

-- -----------------------------------------------------------------------------
-- BLING_ORDERS (Pedidos do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  bling_id INTEGER NOT NULL,
  numero TEXT NOT NULL,
  numero_loja TEXT,
  situacao_id INTEGER,
  situacao_nome TEXT,
  loja_id INTEGER,
  loja_nome TEXT,
  numero_pedido_compra TEXT,
  cliente_id INTEGER,
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_cpf_cnpj TEXT,
  valor_produtos NUMERIC,
  valor_total NUMERIC,
  valor_frete NUMERIC,
  valor_desconto NUMERIC,
  valor_base NUMERIC,
  outras_despesas NUMERIC,
  total_icms NUMERIC,
  total_ipi NUMERIC,
  taxa_comissao NUMERIC,
  custo_frete NUMERIC,
  forma_pagamento TEXT,
  parcelas JSONB,
  intermediador_cnpj TEXT,
  intermediador_nome_usuario TEXT,
  forma_envio TEXT,
  frete_por_conta INTEGER,
  prazo_entrega INTEGER,
  peso_bruto NUMERIC,
  quantidade_volumes INTEGER,
  volumes JSONB,
  endereco_entrega JSONB,
  transportador_id INTEGER,
  transportador_nome TEXT,
  etiqueta JSONB,
  nota_fiscal_id INTEGER,
  observacoes TEXT,
  observacoes_internas TEXT,
  vendedor_id INTEGER,
  categoria_id INTEGER,
  data_criacao TIMESTAMP WITH TIME ZONE,
  data_modificacao TIMESTAMP WITH TIME ZONE,
  data_saida TIMESTAMP WITH TIME ZONE,
  data_prevista TIMESTAMP WITH TIME ZONE,
  raw_data JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

COMMENT ON TABLE public.bling_orders IS 'Pedidos sincronizados do Bling';

-- -----------------------------------------------------------------------------
-- BLING_ORDER_ITEMS (Itens dos Pedidos Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.bling_orders(id) ON DELETE CASCADE,
  bling_id INTEGER,
  produto_id INTEGER,
  produto_nome TEXT,
  sku TEXT,
  quantidade NUMERIC,
  unidade TEXT,
  valor_unitario NUMERIC,
  valor_total NUMERIC,
  desconto NUMERIC,
  preco_custo NUMERIC,
  descricao_detalhada TEXT,
  aliquota_ipi NUMERIC,
  natureza_operacao_id INTEGER,
  comissao_base NUMERIC,
  comissao_aliquota NUMERIC,
  comissao_valor NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.bling_order_items IS 'Itens dos pedidos do Bling';

-- -----------------------------------------------------------------------------
-- BLING_PRODUCTS (Produtos do Bling - completo)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  bling_id INTEGER NOT NULL,
  codigo TEXT,
  nome TEXT NOT NULL,
  tipo TEXT,
  formato TEXT,
  situacao TEXT,
  
  -- Identificadores fiscais
  gtin TEXT,
  gtin_embalagem TEXT,
  ean TEXT,
  ncm TEXT,
  cest TEXT,
  classe_fiscal TEXT,
  origem INTEGER,
  
  -- Preços
  preco NUMERIC,
  preco_custo NUMERIC,
  
  -- Estoque
  estoque_atual NUMERIC,
  estoque_minimo NUMERIC,
  estoque_depositos JSONB,
  
  -- Dimensões e peso
  peso_liquido NUMERIC,
  peso_bruto NUMERIC,
  altura NUMERIC,
  largura NUMERIC,
  profundidade NUMERIC,
  
  -- Informações adicionais
  unidade TEXT,
  categoria_id INTEGER,
  categoria_nome TEXT,
  marca TEXT,
  descricao_curta TEXT,
  descricao_completa TEXT,
  observacoes TEXT,
  localizacao TEXT,
  
  -- Imagens
  imagem_url TEXT,
  imagens JSONB,
  
  -- Fornecedor
  fornecedor_id INTEGER,
  fornecedor_nome TEXT,
  fornecedor_codigo TEXT,
  
  -- Variações e pai
  produto_pai_id INTEGER,
  variacoes JSONB,
  
  -- Flags
  condicao INTEGER,
  frete_gratis BOOLEAN,
  producao_propria BOOLEAN,
  sob_encomenda BOOLEAN,
  
  -- Outros
  garantia INTEGER,
  cross_docking INTEGER,
  volumes_por_produto INTEGER,
  data_validade TEXT,
  
  -- Tributação e NFe
  tributacao JSONB,
  dados_nfe JSONB,
  campos_customizados JSONB,
  
  -- Dados brutos
  raw_data JSONB,
  
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

COMMENT ON TABLE public.bling_products IS 'Produtos sincronizados do Bling (completo)';

-- -----------------------------------------------------------------------------
-- BLING_SYNC_LOGS (Logs de Sincronização Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.bling_sync_logs IS 'Logs de sincronização com Bling';

-- -----------------------------------------------------------------------------
-- BLING_SYNC_JOBS (Jobs de Sincronização Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Campos de paginação retomável
  resume_page INTEGER NOT NULL DEFAULT 1,
  max_pages_per_run INTEGER NOT NULL DEFAULT 3,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT
);

COMMENT ON TABLE public.bling_sync_jobs IS 'Jobs de sincronização assíncrona Bling';

-- -----------------------------------------------------------------------------
-- BLING_WEBHOOK_EVENTS (Eventos de Webhook do Bling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.bling_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'received',
  error TEXT
);

COMMENT ON TABLE public.bling_webhook_events IS 'Eventos recebidos do webhook do Bling';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_bling_connections_company_id ON public.bling_connections(bling_company_id);

CREATE INDEX idx_bling_situacoes_tenant_id ON public.bling_situacoes(tenant_id);
CREATE INDEX idx_bling_situacoes_integration_id ON public.bling_situacoes(integration_id);
CREATE INDEX idx_bling_situacoes_situacao_id ON public.bling_situacoes(situacao_id);

CREATE INDEX idx_bling_code_mappings_lookup ON public.bling_code_mappings(integration_id, mapping_type);

CREATE INDEX idx_bling_customers_tenant_id ON public.bling_customers(tenant_id);
CREATE INDEX idx_bling_customers_integration_id ON public.bling_customers(integration_id);
CREATE INDEX idx_bling_customers_bling_id ON public.bling_customers(bling_id);
CREATE INDEX idx_bling_customers_cpf_cnpj ON public.bling_customers(cpf_cnpj);
CREATE INDEX idx_bling_customers_nome ON public.bling_customers(nome);
CREATE INDEX idx_bling_customers_data_nascimento ON public.bling_customers(data_nascimento);

CREATE INDEX idx_bling_orders_tenant_id ON public.bling_orders(tenant_id);
CREATE INDEX idx_bling_orders_integration_id ON public.bling_orders(integration_id);
CREATE INDEX idx_bling_orders_bling_id ON public.bling_orders(bling_id);
CREATE INDEX idx_bling_orders_situacao ON public.bling_orders(situacao_nome);
CREATE INDEX idx_bling_orders_loja_id ON public.bling_orders(loja_id);
CREATE INDEX idx_bling_orders_data_criacao ON public.bling_orders(data_criacao DESC);

CREATE INDEX idx_bling_order_items_order_id ON public.bling_order_items(order_id);
CREATE INDEX idx_bling_order_items_tenant_id ON public.bling_order_items(tenant_id);

CREATE INDEX idx_bling_products_tenant_id ON public.bling_products(tenant_id);
CREATE INDEX idx_bling_products_integration_id ON public.bling_products(integration_id);
CREATE INDEX idx_bling_products_bling_id ON public.bling_products(bling_id);
CREATE INDEX idx_bling_products_codigo ON public.bling_products(codigo);
CREATE INDEX idx_bling_products_nome ON public.bling_products(nome);
CREATE INDEX idx_bling_products_marca ON public.bling_products(marca) WHERE marca IS NOT NULL;
CREATE INDEX idx_bling_products_ncm ON public.bling_products(ncm) WHERE ncm IS NOT NULL;
CREATE INDEX idx_bling_products_fornecedor ON public.bling_products(fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX idx_bling_products_produto_pai ON public.bling_products(produto_pai_id) WHERE produto_pai_id IS NOT NULL;

CREATE INDEX idx_bling_sync_logs_tenant_id ON public.bling_sync_logs(tenant_id);
CREATE INDEX idx_bling_sync_logs_integration_id ON public.bling_sync_logs(integration_id);
CREATE INDEX idx_bling_sync_logs_status ON public.bling_sync_logs(status);

CREATE INDEX idx_bling_sync_jobs_tenant_id ON public.bling_sync_jobs(tenant_id);
CREATE INDEX idx_bling_sync_jobs_integration_id ON public.bling_sync_jobs(integration_id);
CREATE INDEX idx_bling_sync_jobs_sync_log_id ON public.bling_sync_jobs(sync_log_id);
CREATE INDEX idx_bling_sync_jobs_status ON public.bling_sync_jobs(status);
CREATE INDEX idx_bling_sync_jobs_processor ON public.bling_sync_jobs(job_type, status, integration_id) WHERE status IN ('pending', 'running');
CREATE INDEX idx_bling_sync_jobs_heartbeat ON public.bling_sync_jobs(last_heartbeat_at) WHERE status IN ('pending', 'running');

CREATE INDEX idx_bling_webhook_events_tenant ON public.bling_webhook_events(tenant_id);
CREATE INDEX idx_bling_webhook_events_status ON public.bling_webhook_events(status);
CREATE INDEX idx_bling_webhook_events_received ON public.bling_webhook_events(received_at DESC);
