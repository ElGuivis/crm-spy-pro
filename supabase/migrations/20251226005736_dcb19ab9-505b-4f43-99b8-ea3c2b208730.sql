-- Add new columns to cashback_configs table
ALTER TABLE public.cashback_configs 
ADD COLUMN IF NOT EXISTS min_purchase_value numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_discount_value numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS trigger_statuses text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS webhook_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS send_via_whatsapp boolean DEFAULT true;