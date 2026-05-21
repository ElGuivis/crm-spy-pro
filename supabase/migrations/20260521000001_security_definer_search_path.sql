-- Fix: add explicit search_path to SECURITY DEFINER functions that were missing it.
-- Without SET search_path, these functions are vulnerable to search_path injection
-- if an attacker can create objects in a non-public schema.

ALTER FUNCTION public.get_best_send_hours(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_best_send_days(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_revenue_attribution(uuid, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.process_churn_campaigns() SET search_path = public, pg_catalog;
