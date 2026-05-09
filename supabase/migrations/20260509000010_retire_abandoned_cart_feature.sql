-- Retire the abandoned-cart feature: Loja Integrada doesn't expose a real
-- abandoned-cart endpoint and the existing implementation faked carts from
-- old "aguardando_pagamento" orders. The data tables were never populated
-- in this project (0 rows, 0 active configs) and the helper logic was
-- removed from li-job-processor / li-webhook / ai-chat.
--
-- This drops:
--   * the 3 feature tables (cascade catches FKs from integrations and tenants)
--   * the auto_sync_carts* columns on integrations (no UI, no code consumes them)

DROP TABLE IF EXISTS public.abandoned_cart_executions CASCADE;
DROP TABLE IF EXISTS public.abandoned_carts CASCADE;
DROP TABLE IF EXISTS public.abandoned_cart_configs CASCADE;

ALTER TABLE public.integrations
  DROP COLUMN IF EXISTS auto_sync_carts,
  DROP COLUMN IF EXISTS auto_sync_carts_interval,
  DROP COLUMN IF EXISTS last_sync_carts_at;
