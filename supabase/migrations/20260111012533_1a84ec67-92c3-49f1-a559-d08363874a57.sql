-- Continue fixing remaining RLS policies

-- 3. Fix me_sync_jobs (already has new policy, need to drop old one if exists)
DROP POLICY IF EXISTS "Users can manage their tenant me_sync_jobs" ON public.me_sync_jobs;
CREATE POLICY "Users can manage their tenant me_sync_jobs" 
ON public.me_sync_jobs FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 4. Fix oauth_states (temporary states for OAuth flow)
DROP POLICY IF EXISTS "Users can manage their own oauth_states" ON public.oauth_states;
CREATE POLICY "Users can manage their own oauth_states" 
ON public.oauth_states FOR ALL TO authenticated
USING (user_id = auth.uid());

-- 5. Fix order_notification_configs
DROP POLICY IF EXISTS "Users can view their tenant order_notification_configs" ON public.order_notification_configs;
DROP POLICY IF EXISTS "Users can manage their tenant order_notification_configs" ON public.order_notification_configs;
CREATE POLICY "Users can view their tenant order_notification_configs" 
ON public.order_notification_configs FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can manage their tenant order_notification_configs" 
ON public.order_notification_configs FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. Fix order_notification_executions
DROP POLICY IF EXISTS "Users can view their tenant order_notification_executions" ON public.order_notification_executions;
DROP POLICY IF EXISTS "Service role can insert order_notification_executions" ON public.order_notification_executions;
CREATE POLICY "Users can view their tenant order_notification_executions" 
ON public.order_notification_executions FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can insert order_notification_executions" 
ON public.order_notification_executions FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Fix order_notification_status_rules
DROP POLICY IF EXISTS "Users can view their tenant order_notification_status_rules" ON public.order_notification_status_rules;
DROP POLICY IF EXISTS "Users can manage their tenant order_notification_status_rules" ON public.order_notification_status_rules;
CREATE POLICY "Users can view their tenant order_notification_status_rules" 
ON public.order_notification_status_rules FOR SELECT TO authenticated
USING (config_id IN (SELECT id FROM public.order_notification_configs WHERE tenant_id = public.get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can manage their tenant order_notification_status_rules" 
ON public.order_notification_status_rules FOR ALL TO authenticated
USING (config_id IN (SELECT id FROM public.order_notification_configs WHERE tenant_id = public.get_user_tenant_id(auth.uid())));

-- 8. Add policy to bling_webhook_events (RLS enabled but no policies)
DROP POLICY IF EXISTS "Users can view their tenant bling_webhook_events" ON public.bling_webhook_events;
DROP POLICY IF EXISTS "Allow insert bling_webhook_events" ON public.bling_webhook_events;
CREATE POLICY "Users can view their tenant bling_webhook_events" 
ON public.bling_webhook_events FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Allow webhooks to insert without auth (external webhooks)
CREATE POLICY "Allow insert bling_webhook_events" 
ON public.bling_webhook_events FOR INSERT
WITH CHECK (true);