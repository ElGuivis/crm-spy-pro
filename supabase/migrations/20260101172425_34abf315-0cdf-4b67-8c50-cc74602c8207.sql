-- Enable RLS on ai_agents if not already enabled
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ai_agents table
CREATE POLICY "Users can view their tenant ai_agents"
ON public.ai_agents
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can create ai_agents for their tenant"
ON public.ai_agents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can update their tenant ai_agents"
ON public.ai_agents
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can delete their tenant ai_agents"
ON public.ai_agents
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);