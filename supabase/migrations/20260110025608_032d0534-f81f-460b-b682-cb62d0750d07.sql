-- Ensure Loja Integrada upserts work correctly by enforcing natural keys per integration

ALTER TABLE public.li_orders
  ADD CONSTRAINT li_orders_integration_li_id_key UNIQUE (integration_id, li_id);

ALTER TABLE public.li_customers
  ADD CONSTRAINT li_customers_integration_li_id_key UNIQUE (integration_id, li_id);

ALTER TABLE public.li_products
  ADD CONSTRAINT li_products_integration_li_id_key UNIQUE (integration_id, li_id);
