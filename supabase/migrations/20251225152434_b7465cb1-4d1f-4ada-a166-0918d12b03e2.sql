-- Add payment detail columns to li_orders
ALTER TABLE public.li_orders 
ADD COLUMN IF NOT EXISTS pagamento_tipo text,
ADD COLUMN IF NOT EXISTS pagamento_parcelas integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS pagamento_bandeira text,
ADD COLUMN IF NOT EXISTS pagamento_codigo text;