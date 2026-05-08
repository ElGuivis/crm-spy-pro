-- =============================================================================
-- TABELAS DE TAGS, EVENTOS E BLOQUEIOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TAGS (Tags para Conversas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

COMMENT ON TABLE public.tags IS 'Tags para categorização de conversas';

-- -----------------------------------------------------------------------------
-- CONVERSATION_TAGS (Relação Conversa-Tag)
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

COMMENT ON TABLE public.conversation_tags IS 'Associação entre conversas e tags';

-- -----------------------------------------------------------------------------
-- CONTACT_BLOCKS (Bloqueio de Contatos)
-- -----------------------------------------------------------------------------
CREATE TABLE public.contact_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

COMMENT ON TABLE public.contact_blocks IS 'Contatos bloqueados por tenant';

-- -----------------------------------------------------------------------------
-- CONVERSATION_EVENTS (Eventos de Conversas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'assigned', 'transferred', 'closed', 'reopened', etc
  actor_user_id UUID,
  payload_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversation_events IS 'Log de eventos em conversas';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_tags_tenant_id ON public.tags(tenant_id);
CREATE INDEX idx_conversation_tags_tag_id ON public.conversation_tags(tag_id);
CREATE INDEX idx_contact_blocks_tenant_id ON public.contact_blocks(tenant_id);
CREATE INDEX idx_conversation_events_tenant_id ON public.conversation_events(tenant_id);
CREATE INDEX idx_conversation_events_conversation_id ON public.conversation_events(conversation_id);
CREATE INDEX idx_conversation_events_event_type ON public.conversation_events(event_type);
