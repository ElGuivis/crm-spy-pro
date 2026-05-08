-- Add preco_custo (cost price) column to bling_order_items
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS preco_custo numeric DEFAULT 0;