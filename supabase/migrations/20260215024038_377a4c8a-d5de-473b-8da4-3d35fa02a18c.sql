
-- Fix RLS policies to include tenant owners (not just team_members)
-- Using the existing get_user_tenant_id function which handles both cases

DROP POLICY IF EXISTS "li_customers_select" ON public.li_customers;
CREATE POLICY "li_customers_select" ON public.li_customers
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_orders_select" ON public.li_orders;
CREATE POLICY "li_orders_select" ON public.li_orders
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_products_select" ON public.li_products;
CREATE POLICY "li_products_select" ON public.li_products
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_order_items_select" ON public.li_order_items;
CREATE POLICY "li_order_items_select" ON public.li_order_items
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
