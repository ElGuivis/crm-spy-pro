-- Tabela de clientes sincronizados da Loja Integrada
CREATE TABLE public.li_customers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    nome TEXT,
    email TEXT,
    telefone_celular TEXT,
    telefone_principal TEXT,
    cpf TEXT,
    cnpj TEXT,
    razao_social TEXT,
    data_nascimento DATE,
    sexo TEXT,
    endereco_cep TEXT,
    endereco_logradouro TEXT,
    endereco_numero TEXT,
    endereco_complemento TEXT,
    endereco_bairro TEXT,
    endereco_cidade TEXT,
    endereco_estado TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de produtos sincronizados da Loja Integrada
CREATE TABLE public.li_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    sku TEXT,
    nome TEXT NOT NULL,
    apelido TEXT,
    descricao_completa TEXT,
    ativo BOOLEAN DEFAULT true,
    destaque BOOLEAN DEFAULT false,
    peso NUMERIC,
    altura NUMERIC,
    largura NUMERIC,
    profundidade NUMERIC,
    tipo TEXT,
    preco_cheio NUMERIC,
    preco_custo NUMERIC,
    preco_promocional NUMERIC,
    estoque_quantidade INTEGER DEFAULT 0,
    estoque_gerenciado BOOLEAN DEFAULT true,
    imagem_url TEXT,
    url TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de pedidos sincronizados da Loja Integrada
CREATE TABLE public.li_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    numero TEXT NOT NULL,
    situacao_id INTEGER,
    situacao_nome TEXT,
    cliente_li_id INTEGER,
    cliente_nome TEXT,
    cliente_email TEXT,
    cliente_telefone TEXT,
    valor_subtotal NUMERIC,
    valor_desconto NUMERIC,
    valor_frete NUMERIC,
    valor_total NUMERIC,
    peso_real NUMERIC,
    forma_pagamento TEXT,
    forma_envio TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    data_expiracao TIMESTAMP WITH TIME ZONE,
    endereco_entrega_cep TEXT,
    endereco_entrega_logradouro TEXT,
    endereco_entrega_numero TEXT,
    endereco_entrega_complemento TEXT,
    endereco_entrega_bairro TEXT,
    endereco_entrega_cidade TEXT,
    endereco_entrega_estado TEXT,
    observacoes TEXT,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de itens dos pedidos
CREATE TABLE public.li_order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
    product_li_id INTEGER,
    produto_nome TEXT,
    sku TEXT,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC,
    preco_subtotal NUMERIC,
    peso NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de log de sincronização
CREATE TABLE public.li_sync_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_type TEXT NOT NULL, -- 'customers', 'products', 'orders', 'webhook'
    status TEXT NOT NULL, -- 'started', 'completed', 'failed'
    records_synced INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies para permitir operações (sistema interno - usar service role key)
CREATE POLICY "Allow all operations on li_customers" ON public.li_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_products" ON public.li_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_orders" ON public.li_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_order_items" ON public.li_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_sync_logs" ON public.li_sync_logs FOR ALL USING (true) WITH CHECK (true);

-- Índices para performance
CREATE INDEX idx_li_customers_email ON public.li_customers(email);
CREATE INDEX idx_li_customers_li_id ON public.li_customers(li_id);
CREATE INDEX idx_li_products_sku ON public.li_products(sku);
CREATE INDEX idx_li_products_li_id ON public.li_products(li_id);
CREATE INDEX idx_li_orders_numero ON public.li_orders(numero);
CREATE INDEX idx_li_orders_li_id ON public.li_orders(li_id);
CREATE INDEX idx_li_orders_cliente_li_id ON public.li_orders(cliente_li_id);
CREATE INDEX idx_li_orders_data_criacao ON public.li_orders(data_criacao DESC);
CREATE INDEX idx_li_order_items_order_id ON public.li_order_items(order_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_li_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_li_customers_updated_at BEFORE UPDATE ON public.li_customers FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();
CREATE TRIGGER update_li_products_updated_at BEFORE UPDATE ON public.li_products FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();
CREATE TRIGGER update_li_orders_updated_at BEFORE UPDATE ON public.li_orders FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();