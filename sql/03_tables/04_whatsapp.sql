-- =============================================================================
-- TABELAS DE WHATSAPP - Contatos, Conversas, Mensagens, Kanban
-- =============================================================================

-- -----------------------------------------------------------------------------
-- KANBAN_COLUMNS (Colunas do Kanban)
-- -----------------------------------------------------------------------------
CREATE TABLE public.kanban_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  position INTEGER NOT NULL DEFAULT 0,
  is_default_for_new BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kanban_columns IS 'Colunas do quadro Kanban de atendimento';

-- -----------------------------------------------------------------------------
-- CONTACTS (Contatos de WhatsApp)
-- -----------------------------------------------------------------------------
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  li_customer_id UUID, -- Referência ao cliente da Loja Integrada (FK adicionada em 05_loja_integrada.sql)
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

COMMENT ON TABLE public.contacts IS 'Contatos de WhatsApp';

-- -----------------------------------------------------------------------------
-- CONVERSATIONS (Conversas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  kanban_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  current_ai_agent_id UUID, -- Referência ao ai_agents (FK adicionada em 10_ai.sql)
  assigned_to UUID, -- Referência ao profiles.user_id
  status VARCHAR NOT NULL DEFAULT 'bot',
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_incoming_message_id TEXT,
  
  -- Inbox e Canal
  inbox_id UUID, -- Referência a inboxes (FK adicionada no arquivo 17)
  channel_id UUID, -- Referência a whatsapp_channels (FK adicionada no arquivo 17)
  
  -- Handoff e prioridade
  handoff_mode BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'normal',
  
  -- Lead capture
  lead_capture_state TEXT,
  lead_capture_data JSONB DEFAULT '{}'::jsonb,
  
  -- Verificação de pedidos
  verification_state TEXT,
  verification_data JSONB,
  
  -- Bot state
  bot_state_json JSONB,
  
  -- Buffer de mensagens (AI delay)
  pending_ai_response_at TIMESTAMP WITH TIME ZONE,
  buffered_message_ids TEXT[] DEFAULT '{}'::text[],
  awaiting_phone_input BOOLEAN DEFAULT false,
  
  -- Chatwoot sync
  chatwoot_conversation_id INTEGER,
  
  -- Timestamps extras
  last_inbound_at TIMESTAMP WITH TIME ZONE,
  last_outbound_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversations IS 'Conversas de WhatsApp';

-- -----------------------------------------------------------------------------
-- MESSAGES (Mensagens)
-- -----------------------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  content_type VARCHAR NOT NULL DEFAULT 'text',
  media_url TEXT,
  status VARCHAR NOT NULL DEFAULT 'sent',
  metadata JSONB DEFAULT '{}'::jsonb,
  chatwoot_message_id INTEGER,
  
  -- Colunas adicionais
  direction TEXT NOT NULL DEFAULT 'inbound',
  type TEXT NOT NULL DEFAULT 'text',
  provider_message_id TEXT,
  error_json JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Mensagens das conversas';

-- -----------------------------------------------------------------------------
-- NOTIFICATION_SETTINGS (Configurações de Notificação)
-- NOTA: Usa tenant_id (não user_id) como referência principal
-- -----------------------------------------------------------------------------
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_volume NUMERIC,
  desktop_notifications BOOLEAN NOT NULL DEFAULT false,
  new_message_sound TEXT,
  new_conversation_sound TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_settings IS 'Preferências de notificação por tenant';

-- -----------------------------------------------------------------------------
-- QUICK_REPLIES (Respostas Rápidas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.quick_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  category TEXT,
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.quick_replies IS 'Respostas rápidas pré-definidas';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_kanban_columns_tenant_id ON public.kanban_columns(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_li_customer_id ON public.contacts(li_customer_id);
CREATE INDEX idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_status ON public.conversations(tenant_id, status);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversations_kanban_column ON public.conversations(kanban_column_id);
CREATE INDEX idx_conversations_inbox_id ON public.conversations(inbox_id);
CREATE INDEX idx_conversations_channel_id ON public.conversations(channel_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_messages_direction ON public.messages(direction);
CREATE INDEX idx_messages_provider_message_id ON public.messages(provider_message_id);
CREATE INDEX idx_quick_replies_tenant_id ON public.quick_replies(tenant_id);
