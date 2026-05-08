-- Drop existing unique constraints on li_id only
ALTER TABLE li_customers DROP CONSTRAINT IF EXISTS li_customers_li_id_key;
ALTER TABLE li_products DROP CONSTRAINT IF EXISTS li_products_li_id_key;
ALTER TABLE li_orders DROP CONSTRAINT IF EXISTS li_orders_li_id_key;

-- Create composite unique constraints on (li_id, integration_id)
CREATE UNIQUE INDEX IF NOT EXISTS li_customers_li_id_integration_id_key ON li_customers (li_id, integration_id);
CREATE UNIQUE INDEX IF NOT EXISTS li_products_li_id_integration_id_key ON li_products (li_id, integration_id);
CREATE UNIQUE INDEX IF NOT EXISTS li_orders_li_id_integration_id_key ON li_orders (li_id, integration_id);