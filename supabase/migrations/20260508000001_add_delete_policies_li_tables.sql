-- Add missing DELETE policies for LI tables
-- These tables only had SELECT policies, blocking delete operations via the frontend

CREATE POLICY "li_customers_delete"
  ON public.li_customers FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "li_orders_delete"
  ON public.li_orders FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "li_order_items_delete"
  ON public.li_order_items FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "li_products_delete"
  ON public.li_products FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
