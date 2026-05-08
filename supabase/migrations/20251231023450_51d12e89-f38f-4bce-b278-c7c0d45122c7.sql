-- Tabela de contatos/leads (vinculada a clientes existentes ou novos)
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  li_customer_id UUID REFERENCES public.li_customers(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Tabela de conversas
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  chatwoot_conversation_id INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'bot',
  assigned_to UUID,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de mensagens
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  chatwoot_message_id INTEGER,
  sender_type VARCHAR(20) NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  content_type VARCHAR(20) NOT NULL DEFAULT 'text',
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração do AI por tenant
CREATE TABLE public.ai_assistant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  system_prompt TEXT,
  welcome_message TEXT DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo?',
  transfer_keywords TEXT[] DEFAULT ARRAY['atendente', 'humano', 'pessoa', 'falar com alguém'],
  business_hours JSONB DEFAULT '{"enabled": false}',
  out_of_hours_message TEXT DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  max_context_messages INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_contacts_tenant_phone ON public.contacts(tenant_id, phone);
CREATE INDEX idx_conversations_tenant_status ON public.conversations(tenant_id, status);
CREATE INDEX idx_conversations_contact ON public.conversations(contact_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_tenant_created ON public.messages(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contacts
CREATE POLICY "Tenant members can view contacts"
ON public.contacts FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage contacts"
ON public.contacts FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for conversations
CREATE POLICY "Tenant members can view conversations"
ON public.conversations FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage conversations"
ON public.conversations FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for messages
CREATE POLICY "Tenant members can view messages"
ON public.messages FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage messages"
ON public.messages FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for ai_assistant_configs
CREATE POLICY "Tenant members can view ai_assistant_configs"
ON public.ai_assistant_configs FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage ai_assistant_configs"
ON public.ai_assistant_configs FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_assistant_configs_updated_at
BEFORE UPDATE ON public.ai_assistant_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();