-- Fix all error-level RLS policy issues by adding explicit authentication requirements
-- Tables: contacts, li_customers, generated_coupons, abandoned_carts, li_orders, integrations, email_integrations, tenant_ai_credentials, messages

-- 1. Fix contacts table (already fixed in previous migration)
-- Skipping as it was already fixed

-- 2. Fix li_customers table
DROP POLICY IF EXISTS "Tenant admins can manage li_customers" ON public.li_customers;
DROP POLICY IF EXISTS "Tenant members can view li_customers" ON public.li_customers;

CREATE POLICY "Tenant admins can manage li_customers" 
ON public.li_customers 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission, true));

CREATE POLICY "Tenant members can view li_customers" 
ON public.li_customers 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission));

-- 3. Fix generated_coupons table
DROP POLICY IF EXISTS "Tenant admins can manage generated_coupons" ON public.generated_coupons;
DROP POLICY IF EXISTS "Tenant members can view generated_coupons" ON public.generated_coupons;

CREATE POLICY "Tenant admins can manage generated_coupons" 
ON public.generated_coupons 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission, true));

CREATE POLICY "Tenant members can view generated_coupons" 
ON public.generated_coupons 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission));

-- 4. Fix abandoned_carts table
DROP POLICY IF EXISTS "Service role can manage abandoned_carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can view their tenant's abandoned carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can insert abandoned carts for their tenant" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can update their tenant's abandoned carts" ON public.abandoned_carts;

CREATE POLICY "Users can view their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned carts for their tenant" 
ON public.abandoned_carts 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- 5. Fix li_orders table
DROP POLICY IF EXISTS "Tenant admins can manage li_orders" ON public.li_orders;
DROP POLICY IF EXISTS "Tenant members can view li_orders" ON public.li_orders;

CREATE POLICY "Tenant admins can manage li_orders" 
ON public.li_orders 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission, true));

CREATE POLICY "Tenant members can view li_orders" 
ON public.li_orders 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission));

-- 6. Fix integrations table
DROP POLICY IF EXISTS "Tenant admins can manage integrations" ON public.integrations;
DROP POLICY IF EXISTS "Tenant members can view integrations" ON public.integrations;

CREATE POLICY "Tenant admins can manage integrations" 
ON public.integrations 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true));

CREATE POLICY "Tenant members can view integrations" 
ON public.integrations 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission));

-- 7. Fix email_integrations table
DROP POLICY IF EXISTS "Tenant admins can manage email_integrations" ON public.email_integrations;
DROP POLICY IF EXISTS "Tenant members can view email_integrations" ON public.email_integrations;

CREATE POLICY "Tenant admins can manage email_integrations" 
ON public.email_integrations 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true));

CREATE POLICY "Tenant members can view email_integrations" 
ON public.email_integrations 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission));

-- 8. Fix tenant_ai_credentials table
DROP POLICY IF EXISTS "Tenants can view their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can insert their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can update their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can delete their own AI credentials" ON public.tenant_ai_credentials;

CREATE POLICY "Tenants can view their own AI credentials" 
ON public.tenant_ai_credentials 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI credentials" 
ON public.tenant_ai_credentials 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can update their own AI credentials" 
ON public.tenant_ai_credentials 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can delete their own AI credentials" 
ON public.tenant_ai_credentials 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- 9. Fix messages table
DROP POLICY IF EXISTS "Tenant admins can manage messages" ON public.messages;
DROP POLICY IF EXISTS "Tenant members can view messages" ON public.messages;

CREATE POLICY "Tenant admins can manage messages" 
ON public.messages 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view messages" 
ON public.messages 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));