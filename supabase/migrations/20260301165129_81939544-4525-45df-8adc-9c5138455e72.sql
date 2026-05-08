
-- ========================================
-- PHASE 5: Advanced Operations
-- ========================================

-- 1. Daily metrics rollup table
CREATE TABLE public.instagram_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  -- Message metrics
  inbound_messages INT DEFAULT 0,
  outbound_messages INT DEFAULT 0,
  new_threads INT DEFAULT 0,
  -- Automation metrics
  private_replies_sent INT DEFAULT 0,
  flows_started INT DEFAULT 0,
  flows_completed INT DEFAULT 0,
  handoffs_to_human INT DEFAULT 0,
  -- Trigger metrics
  comment_triggers INT DEFAULT 0,
  story_reply_triggers INT DEFAULT 0,
  story_mention_triggers INT DEFAULT 0,
  live_comment_triggers INT DEFAULT 0,
  ad_entry_triggers INT DEFAULT 0,
  ref_url_entries INT DEFAULT 0,
  -- Failure metrics
  send_failures INT DEFAULT 0,
  -- Response time (seconds)
  avg_first_response_seconds NUMERIC,
  avg_human_mode_seconds NUMERIC,
  -- Capture metrics
  emails_captured INT DEFAULT 0,
  phones_captured INT DEFAULT 0,
  cta_clicks INT DEFAULT 0,
  pauses_count INT DEFAULT 0,
  -- Metadata
  flow_metrics JSONB DEFAULT '{}'::jsonb,
  trigger_metrics JSONB DEFAULT '{}'::jsonb,
  operator_metrics JSONB DEFAULT '{}'::jsonb,
  media_metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, metric_date)
);

ALTER TABLE public.instagram_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_metrics_daily"
  ON public.instagram_metrics_daily FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. Blocked users table
CREATE TABLE public.instagram_blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  igsid TEXT,
  username TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  unblocked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(channel_id, contact_id, is_active)
);

ALTER TABLE public.instagram_blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_blocked_users"
  ON public.instagram_blocked_users FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 3. Spam threads tracking
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS spam_marked_at TIMESTAMPTZ;
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS spam_marked_by UUID REFERENCES auth.users(id);

-- 4. Term blacklist for triage
CREATE TABLE public.instagram_term_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID,
  term TEXT NOT NULL,
  action TEXT DEFAULT 'flag' CHECK (action IN ('flag', 'hide', 'spam', 'block')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_term_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_term_blacklist"
  ON public.instagram_term_blacklist FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 5. Content publishing table
CREATE TABLE public.instagram_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'reel', 'carousel')),
  caption TEXT,
  media_urls TEXT[] DEFAULT '{}',
  cover_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  ig_media_id TEXT,
  ig_permalink TEXT,
  error_message TEXT,
  linked_flow_id UUID,
  linked_trigger_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_content"
  ON public.instagram_content FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. Media insights table
CREATE TABLE public.instagram_media_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  ig_media_id TEXT NOT NULL,
  media_type TEXT,
  permalink TEXT,
  caption TEXT,
  timestamp TIMESTAMPTZ,
  -- Engagement metrics
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  saves INT DEFAULT 0,
  shares INT DEFAULT 0,
  plays INT DEFAULT 0,
  -- DM correlation
  dm_threads_generated INT DEFAULT 0,
  dm_leads_captured INT DEFAULT 0,
  -- Raw insights
  insights_raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, ig_media_id)
);

ALTER TABLE public.instagram_media_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_media_insights"
  ON public.instagram_media_insights FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Channel-level insights
CREATE TABLE public.instagram_channel_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  insight_date DATE NOT NULL,
  followers_count INT,
  follows_count INT,
  media_count INT,
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  profile_views INT DEFAULT 0,
  website_clicks INT DEFAULT 0,
  email_contacts INT DEFAULT 0,
  phone_call_clicks INT DEFAULT 0,
  get_directions_clicks INT DEFAULT 0,
  audience_demographics JSONB DEFAULT '{}'::jsonb,
  online_followers JSONB DEFAULT '{}'::jsonb,
  insights_raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, insight_date)
);

ALTER TABLE public.instagram_channel_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_channel_insights"
  ON public.instagram_channel_insights FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 8. Comment queue for moderation
CREATE TABLE public.instagram_comment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  ig_comment_id TEXT NOT NULL UNIQUE,
  ig_media_id TEXT,
  parent_comment_id TEXT,
  commenter_igsid TEXT,
  commenter_username TEXT,
  text TEXT,
  is_hidden BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'hidden', 'deleted')),
  flagged_terms TEXT[],
  replied_publicly BOOLEAN DEFAULT false,
  replied_privately BOOLEAN DEFAULT false,
  media_type TEXT,
  is_live_comment BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  moderated_at TIMESTAMPTZ,
  moderated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.instagram_comment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_comment_queue"
  ON public.instagram_comment_queue FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_comment_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_metrics_daily;
