-- Adicionar novas colunas na tabela bling_orders para dados completos da API do Bling

-- Datas adicionais
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS numero_loja TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS data_saida TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS data_prevista TIMESTAMP WITH TIME ZONE;

-- Valores adicionais
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS outras_despesas NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS numero_pedido_compra TEXT;

-- Categoria
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS categoria_id BIGINT;

-- Nota Fiscal vinculada
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS nota_fiscal_id BIGINT;

-- Tributacao
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS total_icms NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS total_ipi NUMERIC DEFAULT 0;

-- Vendedor
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS vendedor_id BIGINT;

-- Intermediador (Marketplace)
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS intermediador_cnpj TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS intermediador_nome_usuario TEXT;

-- Taxas do Marketplace
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS taxa_comissao NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS custo_frete NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS valor_base NUMERIC DEFAULT 0;

-- Transporte expandido
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS frete_por_conta INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS quantidade_volumes INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS peso_bruto NUMERIC;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS prazo_entrega INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS transportador_id BIGINT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS transportador_nome TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS etiqueta JSONB;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS volumes JSONB;

-- Parcelas (array de pagamentos)
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS parcelas JSONB;

-- Adicionar novas colunas na tabela bling_order_items

-- Campos adicionais dos itens
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS unidade TEXT;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS aliquota_ipi NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS descricao_detalhada TEXT;

-- Comissao
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_base NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_aliquota NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC DEFAULT 0;

-- Natureza da operacao
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS natureza_operacao_id BIGINT;

-- Raw data do item para manter todos os dados
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS raw_data JSONB;