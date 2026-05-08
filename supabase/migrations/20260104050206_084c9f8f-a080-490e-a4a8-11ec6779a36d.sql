-- Adicionar colunas enriquecidas em li_orders
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS cliente_cpf_cnpj text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS codigo_rastreio text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS url_rastreio text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS data_envio timestamp with time zone;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS data_pagamento timestamp with time zone;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS cupom_desconto text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS gateway_pagamento text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS transacao_id text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS numero_nota_fiscal text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS valor_seguro numeric;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS nome_destinatario text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS telefone_destinatario text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS envios jsonb;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS parcelas jsonb;

-- Adicionar colunas enriquecidas em li_order_items
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS preco_custo numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS preco_promocional numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS desconto numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS variacao text;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS imagem_url text;

-- Criar índices para melhorar performance de buscas
CREATE INDEX IF NOT EXISTS idx_li_orders_codigo_rastreio ON li_orders(codigo_rastreio) WHERE codigo_rastreio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_orders_cliente_cpf_cnpj ON li_orders(cliente_cpf_cnpj) WHERE cliente_cpf_cnpj IS NOT NULL;