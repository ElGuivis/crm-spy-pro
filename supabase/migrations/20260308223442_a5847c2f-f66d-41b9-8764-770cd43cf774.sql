-- Fix: Restrict whatsapp_channels SELECT to admins only
DROP POLICY IF EXISTS "Tenant members can view their channels" ON public.whatsapp_channels;

CREATE POLICY "Tenant admins can view channels"
  ON public.whatsapp_channels
  FOR SELECT
  TO authenticated
  USING (is_tenant_admin(auth.uid(), tenant_id));

-- Fix: Restrict bling_connections to admins only
DROP POLICY IF EXISTS "Tenant isolation" ON public.bling_connections;

CREATE POLICY "Tenant admins can manage bling_connections"
  ON public.bling_connections
  FOR ALL
  TO authenticated
  USING (is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_admin(auth.uid(), tenant_id));