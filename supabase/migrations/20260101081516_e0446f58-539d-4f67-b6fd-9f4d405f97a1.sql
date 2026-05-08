-- Fix abandoned_cart_configs public exposure
-- Drop the problematic "Service role" policy that allows public access
DROP POLICY IF EXISTS "Service role can manage abandoned_cart_configs" ON public.abandoned_cart_configs;

-- Recreate user policies with explicit auth check to prevent unauthenticated access
DROP POLICY IF EXISTS "Users can view their tenant's abandoned cart configs" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can insert abandoned cart configs for their tenant" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can update their tenant's abandoned cart configs" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can delete their tenant's abandoned cart configs" ON public.abandoned_cart_configs;

CREATE POLICY "Users can view their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned cart configs for their tenant" 
ON public.abandoned_cart_configs 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Fix contacts table public exposure
DROP POLICY IF EXISTS "Tenant members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant admins can manage contacts" ON public.contacts;

CREATE POLICY "Tenant members can view contacts" 
ON public.contacts 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage contacts" 
ON public.contacts 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));