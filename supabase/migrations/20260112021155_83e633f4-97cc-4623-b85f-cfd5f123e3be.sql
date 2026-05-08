-- Corrigir produto_pai_id para BIGINT
ALTER TABLE public.bling_products 
ALTER COLUMN produto_pai_id TYPE bigint USING produto_pai_id::bigint;