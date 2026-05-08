-- Add auto-sync configuration columns to integrations table
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS auto_sync_orders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_customers boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_products boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_carts boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_coupons boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_shipments boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_auto_sync_at timestamp with time zone;