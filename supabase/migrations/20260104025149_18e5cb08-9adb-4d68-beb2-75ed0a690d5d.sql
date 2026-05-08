
-- Conversas unificadas do Meta (separadas do Atendimento existente)
CREATE TABLE public.meta_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger')),
  asset_id TEXT NOT NULL,
  contact_ref TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar_url TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  assigned_to UUID REFERENCES public.profiles(user_id),
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mensagens do Meta (todas as plataformas)
CREATE TABLE public.meta_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.meta_conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger')),
  asset_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_ref TEXT,
  to_ref TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'template', 'document', 'sticker')),
  payload JSONB,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Comentários do Instagram
CREATE TABLE public.meta_ig_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  comment_id TEXT NOT NULL,
  parent_comment_id TEXT,
  text TEXT,
  username TEXT,
  user_id TEXT,
  timestamp TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'hidden')),
  reply_id TEXT,
  reply_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, comment_id)
);

-- Templates do WhatsApp
CREATE TABLE public.meta_whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  status TEXT CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED')),
  components JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, waba_id, template_id)
);

-- Logs de webhook para diagnóstico
CREATE TABLE public.meta_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  channel TEXT,
  event_type TEXT,
  payload JSONB,
  error TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_meta_conversations_tenant ON public.meta_conversations(tenant_id);
CREATE INDEX idx_meta_conversations_channel ON public.meta_conversations(tenant_id, channel);
CREATE INDEX idx_meta_conversations_status ON public.meta_conversations(tenant_id, status);
CREATE INDEX idx_meta_conversations_last_message ON public.meta_conversations(tenant_id, last_message_at DESC);

CREATE INDEX idx_meta_messages_tenant ON public.meta_messages(tenant_id);
CREATE INDEX idx_meta_messages_conversation ON public.meta_messages(conversation_id);
CREATE INDEX idx_meta_messages_created ON public.meta_messages(tenant_id, created_at DESC);

CREATE INDEX idx_meta_ig_comments_tenant ON public.meta_ig_comments(tenant_id);
CREATE INDEX idx_meta_ig_comments_ig_user ON public.meta_ig_comments(tenant_id, ig_user_id);
CREATE INDEX idx_meta_ig_comments_status ON public.meta_ig_comments(tenant_id, status);

CREATE INDEX idx_meta_whatsapp_templates_tenant ON public.meta_whatsapp_templates(tenant_id);
CREATE INDEX idx_meta_webhook_logs_tenant ON public.meta_webhook_logs(tenant_id);
CREATE INDEX idx_meta_webhook_logs_created ON public.meta_webhook_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.meta_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ig_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meta_conversations
CREATE POLICY "Users can view their tenant meta_conversations"
ON public.meta_conversations FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_conversations"
ON public.meta_conversations FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_conversations"
ON public.meta_conversations FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta_conversations"
ON public.meta_conversations FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_messages
CREATE POLICY "Users can view their tenant meta_messages"
ON public.meta_messages FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_messages"
ON public.meta_messages FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_messages"
ON public.meta_messages FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_ig_comments
CREATE POLICY "Users can view their tenant meta_ig_comments"
ON public.meta_ig_comments FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_ig_comments"
ON public.meta_ig_comments FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_ig_comments"
ON public.meta_ig_comments FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_whatsapp_templates
CREATE POLICY "Users can view their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_webhook_logs (view only for users)
CREATE POLICY "Users can view their tenant meta_webhook_logs"
ON public.meta_webhook_logs FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_meta_conversations_updated_at
BEFORE UPDATE ON public.meta_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_messages;
