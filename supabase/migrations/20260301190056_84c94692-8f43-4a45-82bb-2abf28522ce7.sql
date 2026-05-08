
-- ============================================================
-- Create missing Phase 6 experimental tables
-- ============================================================

CREATE TABLE public.instagram_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  enabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, feature_key)
);

CREATE TABLE public.instagram_follow_dm_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  welcome_text text,
  delay_seconds integer NOT NULL DEFAULT 5,
  flow_id uuid,
  once_per_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_share_dm_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  target_mode text NOT NULL DEFAULT 'all',
  target_media_id text,
  flow_id uuid,
  once_per_user_per_automation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_experimental_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  execution_type text NOT NULL,
  config_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RISK FIX 1: RLS policies for ALL Instagram tables
-- ============================================================

ALTER TABLE public.instagram_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_follow_dm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_share_dm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_experimental_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_channel_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_media_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_deep_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ice_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_persistent_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ad_welcome_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_cta_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_cta_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comment_replies_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_metrics_daily ENABLE ROW LEVEL SECURITY;

-- SELECT policies (tenant-scoped)
CREATE POLICY "tenant_select" ON public.instagram_channels FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_threads FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_contacts FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_messages FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_channel_capabilities FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_event_log FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_outbox FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_flows FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_flow_versions FOR SELECT TO authenticated USING (
  flow_id IN (SELECT id FROM public.instagram_flows WHERE channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid())))
);
CREATE POLICY "tenant_select" ON public.instagram_flow_runs FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_media_watchlist FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_deep_links FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_ice_breakers FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_persistent_menu_items FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_ad_welcome_flows FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_content FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_comment_queue FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_feature_flags FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_follow_dm_configs FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_share_dm_configs FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_experimental_executions FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_cta_links FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_cta_link_clicks FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_comment_replies_log FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_metrics_daily FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- INSERT policies (tables the UI writes to)
CREATE POLICY "tenant_insert" ON public.instagram_media_watchlist FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_feature_flags FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert" ON public.instagram_follow_dm_configs FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_share_dm_configs FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_ad_welcome_flows FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_content FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- UPDATE policies
CREATE POLICY "tenant_update" ON public.instagram_media_watchlist FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_feature_flags FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update" ON public.instagram_follow_dm_configs FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_share_dm_configs FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_ad_welcome_flows FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_content FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- DELETE policies
CREATE POLICY "tenant_delete" ON public.instagram_media_watchlist FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_share_dm_configs FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_ad_welcome_flows FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_deep_links FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- ============================================================
-- RISK FIX 2: Atomic CTA click_count increment via RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_cta_click_count(p_cta_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE instagram_cta_links
  SET click_count = COALESCE(click_count, 0) + 1
  WHERE id = p_cta_link_id;
$$;

-- ============================================================
-- RISK FIX 5: Remove orphaned capability columns
-- ============================================================
ALTER TABLE public.instagram_channels DROP COLUMN IF EXISTS supports_follow_to_dm;
ALTER TABLE public.instagram_channels DROP COLUMN IF EXISTS supports_share_to_dm;
