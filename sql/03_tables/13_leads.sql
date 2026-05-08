-- =============================================================================
-- TABELAS DE LEADS E RECEPCIONISTA VIRTUAL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LEADS (Leads Capturados)
-- -----------------------------------------------------------------------------
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  
  -- Dados do lead
  name TEXT,
  phone TEXT,
  email TEXT,
  
  -- Origem
  source TEXT, -- 'whatsapp', 'instagram', 'website', 'manual'
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Leads capturados de diversas fontes';

-- -----------------------------------------------------------------------------
-- RECEPTIONIST_CONFIGS (Configuração do Recepcionista Virtual)
-- -----------------------------------------------------------------------------
CREATE TABLE public.receptionist_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Recepcionista Virtual',
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  -- Mensagens
  welcome_message TEXT NOT NULL DEFAULT 'Olá! Como posso ajudar?',
  human_handoff_message TEXT NOT NULL DEFAULT 'Aguarde, estou transferindo para um atendente.',
  
  -- Menu interativo
  menu_format TEXT NOT NULL DEFAULT 'list', -- 'list', 'buttons', 'text'
  menu_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  menu_trigger_keywords JSONB NOT NULL DEFAULT '["menu", "opcoes", "opções"]'::jsonb,
  list_title TEXT DEFAULT 'Selecione uma opção',
  list_button_text TEXT DEFAULT 'Ver opções',
  
  -- Coluna de destino padrão
  target_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  
  -- Captura de leads
  lead_capture_enabled BOOLEAN DEFAULT false,
  lead_capture_name_message TEXT DEFAULT 'Para um melhor atendimento, qual é o seu nome?',
  lead_capture_phone_message TEXT DEFAULT 'Qual seu número de telefone?',
  lead_capture_success_message TEXT DEFAULT 'Obrigado! Como posso ajudar?',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.receptionist_configs IS 'Configuração do recepcionista virtual por tenant';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX idx_leads_contact_id ON public.leads(contact_id);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

CREATE INDEX idx_receptionist_configs_tenant_id ON public.receptionist_configs(tenant_id);
