-- Create table for Instagram accounts
CREATE TABLE public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  webhook_configured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, instagram_user_id)
);

-- Create table for Instagram messages
CREATE TABLE public.instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ig_message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  sender_username TEXT,
  recipient_id TEXT NOT NULL,
  message_text TEXT,
  attachment_type TEXT,
  attachment_url TEXT,
  is_from_me BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for Instagram settings per tenant
CREATE TABLE public.instagram_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  dm_inbox_enabled BOOLEAN DEFAULT true,
  ai_replies_enabled BOOLEAN DEFAULT false,
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  comment_monitoring_enabled BOOLEAN DEFAULT false,
  auto_publish_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for instagram_accounts
CREATE POLICY "Users can view their tenant instagram accounts"
ON public.instagram_accounts FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram accounts for their tenant"
ON public.instagram_accounts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant instagram accounts"
ON public.instagram_accounts FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant instagram accounts"
ON public.instagram_accounts FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for instagram_messages
CREATE POLICY "Users can view their tenant instagram messages"
ON public.instagram_messages FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram messages for their tenant"
ON public.instagram_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for instagram_settings
CREATE POLICY "Users can view their tenant instagram settings"
ON public.instagram_settings FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram settings for their tenant"
ON public.instagram_settings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant instagram settings"
ON public.instagram_settings FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- Create indexes for better performance
CREATE INDEX idx_instagram_accounts_tenant ON public.instagram_accounts(tenant_id);
CREATE INDEX idx_instagram_messages_account ON public.instagram_messages(instagram_account_id);
CREATE INDEX idx_instagram_messages_conversation ON public.instagram_messages(conversation_id);

-- Trigger for updated_at
CREATE TRIGGER update_instagram_accounts_updated_at
BEFORE UPDATE ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_instagram_settings_updated_at
BEFORE UPDATE ON public.instagram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for instagram_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;