
-- Phase 3: Growth Tools - New tables and columns

-- 1. instagram_deep_links
CREATE TABLE IF NOT EXISTS public.instagram_deep_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  slug TEXT NOT NULL,
  ref_key TEXT NOT NULL,
  flow_id UUID,
  metadata JSONB DEFAULT '{}',
  click_count INTEGER NOT NULL DEFAULT 0,
  conversation_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE public.instagram_deep_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_deep_links FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. instagram_media_watchlist
CREATE TABLE IF NOT EXISTS public.instagram_media_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  media_id TEXT,
  media_type TEXT NOT NULL DEFAULT 'post',
  watch_mode TEXT NOT NULL DEFAULT 'specific',
  keywords_include TEXT[] DEFAULT '{}',
  keywords_exclude TEXT[] DEFAULT '{}',
  reply_public_enabled BOOLEAN NOT NULL DEFAULT false,
  reply_public_variants TEXT[] DEFAULT '{}',
  private_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  private_reply_flow_id UUID,
  first_comment_only BOOLEAN NOT NULL DEFAULT false,
  delay_seconds INTEGER DEFAULT 0,
  round_robin_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_media_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_media_watchlist FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 3. instagram_ice_breakers
CREATE TABLE IF NOT EXISTS public.instagram_ice_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  text TEXT NOT NULL,
  flow_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_ice_breakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_ice_breakers FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 4. instagram_persistent_menu_items
CREATE TABLE IF NOT EXISTS public.instagram_persistent_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'postback',
  action_payload TEXT,
  flow_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_persistent_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_persistent_menu_items FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 5. instagram_ad_welcome_flows
CREATE TABLE IF NOT EXISTS public.instagram_ad_welcome_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  name TEXT NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  flow_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_ad_welcome_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_ad_welcome_flows FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. instagram_comment_replies_log (idempotency for comment replies)
CREATE TABLE IF NOT EXISTS public.instagram_comment_replies_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  comment_id TEXT NOT NULL,
  reply_type TEXT NOT NULL,
  watchlist_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, reply_type)
);

ALTER TABLE public.instagram_comment_replies_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_comment_replies_log FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Add entrypoint columns to instagram_threads (if not exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_threads' AND column_name = 'entrypoint_type') THEN
    ALTER TABLE public.instagram_threads ADD COLUMN entrypoint_type TEXT DEFAULT 'dm';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_threads' AND column_name = 'entrypoint_ref') THEN
    ALTER TABLE public.instagram_threads ADD COLUMN entrypoint_ref TEXT;
  END IF;
END $$;

-- 8. Add entrypoint fields to instagram_contacts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_contacts' AND column_name = 'source_first_entry') THEN
    ALTER TABLE public.instagram_contacts ADD COLUMN source_first_entry TEXT DEFAULT 'dm';
  END IF;
END $$;

-- 9. Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_deep_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_media_watchlist;
