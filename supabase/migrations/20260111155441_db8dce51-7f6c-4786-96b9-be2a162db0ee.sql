-- Enriquecer tabela bling_products com todos os dados disponíveis da API

-- Dimensões completas
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS altura NUMERIC;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS largura NUMERIC;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS profundidade NUMERIC;

-- Fornecedor
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_nome TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_codigo TEXT;

-- Marca
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS marca TEXT;

-- Múltiplas imagens (array de objetos com link, tipoArmazenamento, etc)
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS imagens JSONB;

-- Variações (para produtos pai)
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS variacoes JSONB;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS produto_pai_id INTEGER;

-- Tributação
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS cest TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS origem INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS tributacao JSONB;

-- Estoque detalhado por depósito
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS estoque_depositos JSONB;

-- Campos adicionais
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS condicao INTEGER; -- 0=Não especificado, 1=Novo, 2=Usado
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS frete_gratis BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS producao_propria BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS localizacao TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS cross_docking INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS garantia INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS volumes_por_produto INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS gtin_embalagem TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS campos_customizados JSONB;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS data_validade DATE;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS classe_fiscal TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS sob_encomenda BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS ean TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS dados_nfe JSONB;

-- Índices para buscas comuns
CREATE INDEX IF NOT EXISTS idx_bling_products_fornecedor ON bling_products(fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_marca ON bling_products(marca) WHERE marca IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_ncm ON bling_products(ncm) WHERE ncm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_produto_pai ON bling_products(produto_pai_id) WHERE produto_pai_id IS NOT NULL;