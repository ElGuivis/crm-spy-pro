-- Add removido column to track products in trash
ALTER TABLE public.li_products 
ADD COLUMN IF NOT EXISTS removido BOOLEAN DEFAULT false;

-- Index for filtering queries
CREATE INDEX IF NOT EXISTS idx_li_products_removido 
ON public.li_products(removido) WHERE removido = false;