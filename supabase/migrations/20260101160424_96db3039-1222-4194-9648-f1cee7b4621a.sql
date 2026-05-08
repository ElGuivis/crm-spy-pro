-- 1. Update existing conversations without integration_id
UPDATE conversations 
SET integration_id = '7340b82a-2a8d-49e2-af7b-afe08f5459c0'
WHERE tenant_id = '76ec7577-43c3-41e4-935f-1f0d1102f900'
  AND integration_id IS NULL;

-- 2. Fix notification_settings RLS policies to use get_user_tenant_id (includes owner)
DROP POLICY IF EXISTS "Users can create notification settings for their tenant" ON notification_settings;
DROP POLICY IF EXISTS "Users can view their tenant's notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can update their tenant's notification settings" ON notification_settings;

CREATE POLICY "Tenant members can view notification settings" 
ON notification_settings 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can create notification settings" 
ON notification_settings 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update notification settings" 
ON notification_settings 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));