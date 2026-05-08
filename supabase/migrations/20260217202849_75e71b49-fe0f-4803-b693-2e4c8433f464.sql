
-- =============================================================================
-- FASE 1: Módulo de Atendimentos - Schema Foundation
-- =============================================================================

-- 1. WHATSAPP_CHANNELS
CREATE TABLE public.whatsapp_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('evolution', 'meta')),
  display_name TEXT NOT NULL,
  phone_e164 TEXT,
  provider_account_id TEXT, -- instance name (Evolution) or phone_number_id (Meta)
  waba_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  webhook_secret TEXT,
  access_token TEXT,
  metadata_json JSONB DEFAULT '{}',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their channels"
  ON public.whatsapp_channels FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage channels"
  ON public.whatsapp_channels FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE INDEX idx_whatsapp_channels_tenant ON public.whatsapp_channels(tenant_id);

-- 2. INBOXES
CREATE TABLE public.inboxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  bot_enabled BOOLEAN NOT NULL DEFAULT false,
  sla_first_response_minutes INTEGER,
  sla_resolution_minutes INTEGER,
  business_hours_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their inboxes"
  ON public.inboxes FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage inboxes"
  ON public.inboxes FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE INDEX idx_inboxes_tenant ON public.inboxes(tenant_id);
CREATE INDEX idx_inboxes_channel ON public.inboxes(channel_id);

-- 3. ALTER CONVERSATIONS - add new columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_state_json JSONB,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversations_inbox ON public.conversations(inbox_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON public.conversations(priority);

-- 4. ALTER MESSAGES - add new columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound', 'internal_note', 'system')),
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS error_json JSONB,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'video', 'file', 'interactive'));

CREATE INDEX IF NOT EXISTS idx_messages_provider_msg ON public.messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON public.messages(direction);

-- 5. WEBHOOK_EVENTS
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')),
  error_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE UNIQUE INDEX idx_webhook_events_idempotency
  ON public.webhook_events(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX idx_webhook_events_status ON public.webhook_events(processing_status);
CREATE INDEX idx_webhook_events_tenant ON public.webhook_events(tenant_id);

-- 6. OUTBOUND_QUEUE
CREATE TABLE public.outbound_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  to_phone_e164 TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view outbound queue"
  ON public.outbound_queue FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_outbound_queue_pending ON public.outbound_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_outbound_queue_tenant ON public.outbound_queue(tenant_id);

-- 7. CONVERSATION_EVENTS
CREATE TABLE public.conversation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view conversation events"
  ON public.conversation_events FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_conv_events_conversation ON public.conversation_events(conversation_id);
CREATE INDEX idx_conv_events_tenant ON public.conversation_events(tenant_id);

-- 8. TAGS
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view tags"
  ON public.tags FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage tags"
  ON public.tags FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_tags_tenant ON public.tags(tenant_id);

-- 9. CONVERSATION_TAGS
CREATE TABLE public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view conversation tags"
  ON public.conversation_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Tenant members can manage conversation tags"
  ON public.conversation_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

-- 10. CONTACT_BLOCKS
CREATE TABLE public.contact_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

ALTER TABLE public.contact_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view blocks"
  ON public.contact_blocks FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage blocks"
  ON public.contact_blocks FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_contact_blocks_tenant ON public.contact_blocks(tenant_id);

-- 11. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_queue;

-- 12. Update triggers for updated_at
CREATE TRIGGER update_whatsapp_channels_updated_at
  BEFORE UPDATE ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inboxes_updated_at
  BEFORE UPDATE ON public.inboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
