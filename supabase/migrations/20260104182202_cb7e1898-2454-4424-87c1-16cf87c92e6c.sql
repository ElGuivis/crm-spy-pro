-- Campos individuais de intervalo por tipo de sync
ALTER TABLE public.integrations 
  ADD COLUMN IF NOT EXISTS auto_sync_orders_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_customers_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_products_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_carts_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_coupons_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_shipments_interval integer DEFAULT 5;

-- Campos individuais de última sync por tipo
ALTER TABLE public.integrations 
  ADD COLUMN IF NOT EXISTS last_sync_orders_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_customers_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_products_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_carts_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_coupons_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_shipments_at timestamp with time zone;