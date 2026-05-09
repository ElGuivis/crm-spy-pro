-- Fix li_sync_state RLS: align with li_orders/li_customers which use
-- get_user_tenant_id(auth.uid()) instead of the team_members subquery.
-- The previous policy silently blocked tenant owners not present in team_members,
-- preventing the SyncProgressBanner (and any tenant-owned client) from reading state.

DROP POLICY IF EXISTS li_sync_state_select ON public.li_sync_state;
DROP POLICY IF EXISTS li_sync_state_all ON public.li_sync_state;

CREATE POLICY li_sync_state_select
  ON public.li_sync_state
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY li_sync_state_all
  ON public.li_sync_state
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
