
-- Fix overly permissive RLS on birthday_executions
-- Drop the permissive policy and add tenant-scoped ones
DROP POLICY "Service role can manage birthday executions" ON public.birthday_executions;

CREATE POLICY "Users can insert birthday executions for their tenant"
  ON public.birthday_executions FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update birthday executions for their tenant"
  ON public.birthday_executions FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
