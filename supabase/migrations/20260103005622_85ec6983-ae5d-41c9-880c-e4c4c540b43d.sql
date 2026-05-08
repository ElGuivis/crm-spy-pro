-- Add columns for tracking sync per type
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS last_orders_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_customers_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_products_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_carts_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS initial_sync_completed boolean DEFAULT false;

-- Update integrations that already have synced data
UPDATE integrations 
SET initial_sync_completed = true 
WHERE id IN (
  SELECT DISTINCT integration_id FROM li_orders WHERE integration_id IS NOT NULL
);

-- Enable realtime for integrations table
ALTER PUBLICATION supabase_realtime ADD TABLE integrations;