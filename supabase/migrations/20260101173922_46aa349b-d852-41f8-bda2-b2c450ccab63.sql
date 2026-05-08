-- Drop existing policies that only check team_members
DROP POLICY IF EXISTS "Users can view their tenant's agent assignments" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can create agent assignments for their tenant" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can update their tenant's agent assignments" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can delete their tenant's agent assignments" ON public.ai_agent_column_assignments;

-- Create new policies using get_user_tenant_id which checks both owners and team_members
CREATE POLICY "Tenant users can view agent assignments"
ON public.ai_agent_column_assignments FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can create agent assignments"
ON public.ai_agent_column_assignments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can update agent assignments"
ON public.ai_agent_column_assignments FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can delete agent assignments"
ON public.ai_agent_column_assignments FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));