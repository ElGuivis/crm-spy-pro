-- Adicionar campos para suporte a produtos pai/filho na Loja Integrada
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS produto_pai_id INTEGER;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS imagens JSONB;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS variacoes JSONB;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS atributos JSONB;

-- Índice para buscar filhos de um produto pai
CREATE INDEX IF NOT EXISTS idx_li_products_produto_pai 
ON li_products(integration_id, produto_pai_id);