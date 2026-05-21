-- Add indexes on FK columns that are unindexed and have significant row count.
-- Without these, JOINs and CASCADE DELETEs do table scans.
-- Audited via pg_constraint + pg_index cross-join: 121 unindexed FKs,
-- but only these have >100 rows in live data.

CREATE INDEX IF NOT EXISTS idx_li_order_items_tenant_id ON public.li_order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_li_orders_customer_id ON public.li_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_birthday_executions_config_id ON public.birthday_executions(config_id);
