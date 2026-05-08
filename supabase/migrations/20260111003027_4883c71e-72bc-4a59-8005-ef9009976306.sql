-- Add column to track when status was last verified (separate from synced_at)
ALTER TABLE public.li_orders 
ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMPTZ;

-- Create index for efficient ordering by last_status_check_at
CREATE INDEX IF NOT EXISTS idx_li_orders_last_status_check 
ON public.li_orders (integration_id, last_status_check_at NULLS FIRST)
WHERE situacao_nome NOT ILIKE '%cancelado%' 
  AND situacao_nome NOT ILIKE '%entregue%' 
  AND situacao_nome NOT ILIKE '%devolvido%';