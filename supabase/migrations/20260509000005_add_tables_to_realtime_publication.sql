-- Add every table the frontend subscribes to via postgres_changes to the
-- `supabase_realtime` publication. After the migration to the new Supabase
-- project, the publication came up empty, so no realtime events were being
-- broadcast (chat in atendimentos, sales/products/clients live updates,
-- token balance, sync status — all silently broken).
--
-- REPLICA IDENTITY FULL is required for UPDATE/DELETE events to include the
-- old row, which realtime needs to evaluate row filters and to deliver the
-- previous values to subscribers.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'conversations',
    'messages',
    'li_orders',
    'bling_orders',
    'me_shipments',
    'integrations',
    'li_customers',
    'li_products',
    'bling_customers',
    'bling_products',
    'me_sync_jobs',
    'bling_sync_jobs',
    'tenant_tokens',
    'token_transactions',
    'customer_rfm_snapshots',
    'generated_coupons'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- REPLICA IDENTITY FULL (idempotent — Postgres no-ops if already FULL)
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

    -- Add to publication only if not already there
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
