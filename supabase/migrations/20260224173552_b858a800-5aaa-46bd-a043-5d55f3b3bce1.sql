
-- Set all auto_sync columns to default true
ALTER TABLE public.integrations
  ALTER COLUMN auto_sync_enabled SET DEFAULT true,
  ALTER COLUMN auto_sync_orders SET DEFAULT true,
  ALTER COLUMN auto_sync_customers SET DEFAULT true,
  ALTER COLUMN auto_sync_products SET DEFAULT true,
  ALTER COLUMN auto_sync_carts SET DEFAULT true,
  ALTER COLUMN auto_sync_coupons SET DEFAULT true,
  ALTER COLUMN auto_sync_shipments SET DEFAULT true;

-- Activate all existing integrations
UPDATE public.integrations SET
  auto_sync_enabled = true,
  auto_sync_orders = true,
  auto_sync_customers = true,
  auto_sync_products = true,
  auto_sync_carts = true,
  auto_sync_coupons = true,
  auto_sync_shipments = true
WHERE auto_sync_enabled IS NOT TRUE
   OR auto_sync_orders IS NOT TRUE
   OR auto_sync_customers IS NOT TRUE
   OR auto_sync_products IS NOT TRUE
   OR auto_sync_carts IS NOT TRUE
   OR auto_sync_coupons IS NOT TRUE
   OR auto_sync_shipments IS NOT TRUE;

-- Activate all ME auto-sync configs
UPDATE public.me_auto_sync_configs SET is_active = true WHERE is_active = false;
