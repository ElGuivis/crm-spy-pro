-- =============================================================================
-- INSTAGRAM MODULE - PHASE 1: OPERATIONAL BASE
-- =============================================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- ENUM: instagram channel status
-- =============================================================================
CREATE TYPE public.instagram_channel_status AS ENUM (
  'connected', 'expiring', 'expired', 'error', 'disconnected'
);

CREATE TYPE public.instagram_thread_status AS ENUM (
  'open', 'pending', 'bot_active', 'human_active', 'paused', 'closed', 'spam', 'blocked'
);

CREATE TYPE public.instagram_message_direction AS ENUM ('incoming', 'outgoing');

CREATE TYPE public.instagram_delivery_status AS ENUM (
  'pending', 'sent', 'delivered', 'read', 'failed'
);

CREATE TYPE public.instagram_outbox_status AS ENUM (
  'queued', 'processing', 'sent', 'failed', 'dead_letter'
);

-- =============================================================================
-- TABLE: instagram_channels
-- =============================================================================
CREATE TABLE public.instagram_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  instagram_username TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  token_refresh_at TIMESTAMPTZ,
  status public.instagram_channel_status NOT NULL DEFAULT 'disconnected',
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  app_mode TEXT NOT NULL DEFAULT 'development',
  default_locale TEXT DEFAULT 'pt_BR',
  default_timezone TEXT DEFAULT 'America/Sao_Paulo',
  last_sync_at TIMESTAMPTZ,
  last_healthcheck_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_channels ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_channels_tenant ON public.instagram_channels(tenant_id);
CREATE UNIQUE INDEX idx_ig_channels_ig_user ON public.instagram_channels(ig_user_id);

CREATE TRIGGER update_instagram_channels_updated_at
  BEFORE UPDATE ON public.instagram_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
CREATE POLICY "Tenant members can view instagram channels"
  ON public.instagram_channels FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage instagram channels"
  ON public.instagram_channels FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id));

-- =============================================================================
-- TABLE: instagram_channel_capabilities
-- =============================================================================
CREATE TABLE public.instagram_channel_capabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  comments BOOLEAN NOT NULL DEFAULT false,
  private_replies BOOLEAN NOT NULL DEFAULT false,
  story_reply BOOLEAN NOT NULL DEFAULT false,
  story_mention BOOLEAN NOT NULL DEFAULT false,
  live_comments BOOLEAN NOT NULL DEFAULT false,
  welcome_ads BOOLEAN NOT NULL DEFAULT false,
  ice_breakers BOOLEAN NOT NULL DEFAULT false,
  persistent_menu BOOLEAN NOT NULL DEFAULT false,
  follow_to_dm BOOLEAN NOT NULL DEFAULT false,
  share_to_dm BOOLEAN NOT NULL DEFAULT false,
  content_publish BOOLEAN NOT NULL DEFAULT false,
  insights BOOLEAN NOT NULL DEFAULT false,
  moderation BOOLEAN NOT NULL DEFAULT false,
  raw_capabilities JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_channel_capabilities ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_capabilities_channel ON public.instagram_channel_capabilities(channel_id);
CREATE INDEX idx_ig_capabilities_tenant ON public.instagram_channel_capabilities(tenant_id);

CREATE TRIGGER update_instagram_channel_capabilities_updated_at
  BEFORE UPDATE ON public.instagram_channel_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram capabilities"
  ON public.instagram_channel_capabilities FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage instagram capabilities"
  ON public.instagram_channel_capabilities FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id));

-- =============================================================================
-- TABLE: instagram_contacts
-- =============================================================================
CREATE TABLE public.instagram_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  igsid TEXT NOT NULL,
  instagram_username TEXT,
  display_name TEXT,
  profile_pic_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_user_interaction_at TIMESTAMPTZ,
  standard_window_expires_at TIMESTAMPTZ,
  human_window_expires_at TIMESTAMPTZ,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  source_first_entry TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_contacts_channel_igsid ON public.instagram_contacts(channel_id, igsid);
CREATE INDEX idx_ig_contacts_tenant ON public.instagram_contacts(tenant_id);
CREATE INDEX idx_ig_contacts_channel ON public.instagram_contacts(channel_id);
CREATE INDEX idx_ig_contacts_username ON public.instagram_contacts(instagram_username);

CREATE TRIGGER update_instagram_contacts_updated_at
  BEFORE UPDATE ON public.instagram_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram contacts"
  ON public.instagram_contacts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram contacts"
  ON public.instagram_contacts FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_threads
-- =============================================================================
CREATE TABLE public.instagram_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  provider_thread_id TEXT,
  thread_status public.instagram_thread_status NOT NULL DEFAULT 'open',
  current_mode TEXT NOT NULL DEFAULT 'bot',
  assigned_user_id UUID,
  entrypoint_type TEXT,
  entrypoint_ref TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_threads_tenant ON public.instagram_threads(tenant_id);
CREATE INDEX idx_ig_threads_channel ON public.instagram_threads(channel_id);
CREATE INDEX idx_ig_threads_contact ON public.instagram_threads(contact_id);
CREATE INDEX idx_ig_threads_status ON public.instagram_threads(thread_status);
CREATE INDEX idx_ig_threads_last_msg ON public.instagram_threads(last_message_at DESC);

CREATE TRIGGER update_instagram_threads_updated_at
  BEFORE UPDATE ON public.instagram_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram threads"
  ON public.instagram_threads FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram threads"
  ON public.instagram_threads FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_messages
-- =============================================================================
CREATE TABLE public.instagram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.instagram_threads(id) ON DELETE CASCADE,
  provider_message_id TEXT,
  direction public.instagram_message_direction NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  text_body TEXT,
  media_url TEXT,
  payload JSONB,
  sent_by_user_id UUID,
  delivery_status public.instagram_delivery_status NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_messages_thread ON public.instagram_messages(thread_id);
CREATE INDEX idx_ig_messages_tenant ON public.instagram_messages(tenant_id);
CREATE INDEX idx_ig_messages_provider_id ON public.instagram_messages(provider_message_id);
CREATE INDEX idx_ig_messages_created ON public.instagram_messages(created_at DESC);

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON public.instagram_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram messages"
  ON public.instagram_messages FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram messages"
  ON public.instagram_messages FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_webhook_deliveries
-- =============================================================================
CREATE TABLE public.instagram_webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  channel_id UUID REFERENCES public.instagram_channels(id) ON DELETE SET NULL,
  provider_delivery_key TEXT,
  event_hash TEXT,
  signature_valid BOOLEAN,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  parse_status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_webhooks_channel ON public.instagram_webhook_deliveries(channel_id);
CREATE INDEX idx_ig_webhooks_processed ON public.instagram_webhook_deliveries(processed);
CREATE INDEX idx_ig_webhooks_hash ON public.instagram_webhook_deliveries(event_hash);
CREATE INDEX idx_ig_webhooks_created ON public.instagram_webhook_deliveries(created_at DESC);

-- Webhook deliveries: only service role (edge functions) can manage
CREATE POLICY "Service role manages webhook deliveries"
  ON public.instagram_webhook_deliveries FOR ALL
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- TABLE: instagram_event_log
-- =============================================================================
CREATE TABLE public.instagram_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.instagram_channels(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.instagram_threads(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_source TEXT,
  provider_object_id TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  normalized_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_event_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_events_tenant ON public.instagram_event_log(tenant_id);
CREATE INDEX idx_ig_events_channel ON public.instagram_event_log(channel_id);
CREATE INDEX idx_ig_events_type ON public.instagram_event_log(event_type);
CREATE INDEX idx_ig_events_time ON public.instagram_event_log(event_time DESC);

CREATE POLICY "Tenant members can view instagram events"
  ON public.instagram_event_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Event log: only service role inserts
CREATE POLICY "Service role manages event log"
  ON public.instagram_event_log FOR INSERT
  WITH CHECK (false);

-- =============================================================================
-- TABLE: instagram_outbox
-- =============================================================================
CREATE TABLE public.instagram_outbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.instagram_threads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE SET NULL,
  message_kind TEXT NOT NULL DEFAULT 'text',
  payload JSONB NOT NULL,
  send_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.instagram_outbox_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_outbox ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_outbox_idempotency ON public.instagram_outbox(idempotency_key);
CREATE INDEX idx_ig_outbox_tenant ON public.instagram_outbox(tenant_id);
CREATE INDEX idx_ig_outbox_status ON public.instagram_outbox(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_ig_outbox_send_after ON public.instagram_outbox(send_after) WHERE status = 'queued';
CREATE INDEX idx_ig_outbox_channel ON public.instagram_outbox(channel_id);

CREATE TRIGGER update_instagram_outbox_updated_at
  BEFORE UPDATE ON public.instagram_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram outbox"
  ON public.instagram_outbox FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert into instagram outbox"
  ON public.instagram_outbox FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- Enable realtime for key tables
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;