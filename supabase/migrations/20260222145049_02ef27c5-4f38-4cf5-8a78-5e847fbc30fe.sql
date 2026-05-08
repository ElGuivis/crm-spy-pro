-- Fix: Replace overly permissive INSERT policy on bling_webhook_events
-- Webhook events are inserted by edge functions using service_role (which bypasses RLS),
-- so the public INSERT policy with WITH CHECK (true) is unnecessary and a security risk.
DROP POLICY IF EXISTS "Allow insert bling_webhook_events" ON public.bling_webhook_events;