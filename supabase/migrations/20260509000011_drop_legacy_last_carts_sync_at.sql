-- Follow-up to 20260509000010 retiring abandoned-cart feature.
-- The previous migration dropped auto_sync_carts*, auto_sync_carts_interval
-- and last_sync_carts_at, but missed last_carts_sync_at (older naming
-- convention left over from a pre-2026 schema).

ALTER TABLE public.integrations
  DROP COLUMN IF EXISTS last_carts_sync_at;
