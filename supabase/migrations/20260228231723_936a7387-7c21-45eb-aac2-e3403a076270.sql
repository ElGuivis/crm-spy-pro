
-- Fix: Allow all tenant members (not just admins) to manage conversations
DROP POLICY IF EXISTS "Tenant admins can manage conversations" ON conversations;
CREATE POLICY "Tenant members can manage conversations"
  ON conversations FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Fix: Allow all tenant members to manage messages (send, insert system messages)
DROP POLICY IF EXISTS "Tenant admins can manage messages" ON messages;
CREATE POLICY "Tenant members can manage messages"
  ON messages FOR ALL
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Fix: Allow all tenant members to insert conversation events
DROP POLICY IF EXISTS "Tenant members can view conversation events" ON conversation_events;
CREATE POLICY "Tenant members can manage conversation events"
  ON conversation_events FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
