-- Remove old permissive policies that were not dropped before

DROP POLICY IF EXISTS "Service role can manage abandoned_cart_executions" ON public.abandoned_cart_executions;
DROP POLICY IF EXISTS "Service role can manage provider health" ON public.ai_provider_health;
DROP POLICY IF EXISTS "Service role can manage me_sync_jobs" ON public.me_sync_jobs;
DROP POLICY IF EXISTS "Service role can manage oauth_states" ON public.oauth_states;
DROP POLICY IF EXISTS "Service role can manage order_notification_configs" ON public.order_notification_configs;
DROP POLICY IF EXISTS "Service role can manage order_notification_executions" ON public.order_notification_executions;
DROP POLICY IF EXISTS "Service role can manage order_notification_status_rules" ON public.order_notification_status_rules;