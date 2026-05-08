-- Fix message_queue RLS policy to require authentication
DROP POLICY IF EXISTS "Service role can manage message_queue" ON public.message_queue;
DROP POLICY IF EXISTS "Tenant members can view their message queue" ON public.message_queue;

-- Recreate with proper authentication requirements
CREATE POLICY "Tenant members can view their message queue" 
ON public.message_queue 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage message queue" 
ON public.message_queue 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));