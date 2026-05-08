-- =============================================================================
-- TABELAS DE IA - Agentes, Configs, Usage Logs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- AI_AGENTS (Agentes de IA)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  agent_type TEXT NOT NULL DEFAULT 'chatbot', -- 'chatbot', 'ai_agent'
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Modelo e prompt
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  ai_provider TEXT,
  system_prompt TEXT NOT NULL,
  temperature NUMERIC DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1024,
  
  -- Mensagem de boas-vindas
  welcome_message TEXT,
  
  -- Buffer de mensagens
  message_buffer_enabled BOOLEAN DEFAULT false,
  message_buffer_delay_seconds INTEGER DEFAULT 10,
  
  -- Transferência para humano
  transfer_keywords TEXT[] DEFAULT '{}'::text[],
  human_transfer_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  
  -- Verificação de pedidos
  order_verification_enabled BOOLEAN DEFAULT false,
  order_verification_mode TEXT DEFAULT 'sequential',
  verification_type TEXT,
  order_verification_messages JSONB,
  order_details_template TEXT,
  order_not_found_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  after_verified_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  cpf_max_attempts_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  tracking_link_base TEXT,
  
  -- Inatividade
  inactivity_enabled BOOLEAN DEFAULT false,
  inactivity_timeout_minutes INTEGER,
  inactivity_message TEXT DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!',
  inactivity_target_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  
  -- Transferência para outros agentes
  agent_transfer_rules JSONB DEFAULT '[]'::jsonb,
  keyword_action_rules JSONB DEFAULT '[]'::jsonb,
  
  -- Botões interativos
  interactive_buttons JSONB DEFAULT '[]'::jsonb,
  
  -- Acesso a dados
  data_access JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_agents IS 'Agentes de IA configuráveis por tenant';

-- Adicionar FK de conversations para ai_agents
ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_current_ai_agent_id_fkey 
FOREIGN KEY (current_ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- AI_AGENT_COLUMN_ASSIGNMENTS (Atribuição de Agentes a Colunas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ai_agent_column_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(column_id, tenant_id)
);

COMMENT ON TABLE public.ai_agent_column_assignments IS 'Mapeamento de agentes para colunas do kanban';

-- -----------------------------------------------------------------------------
-- AI_ASSISTANT_CONFIGS (Configuração Global do Assistente)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ai_assistant_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  -- Prompt e contexto
  system_prompt TEXT,
  welcome_message TEXT,
  max_context_messages INTEGER DEFAULT 10,
  
  -- Horário comercial
  business_hours JSONB,
  out_of_hours_message TEXT,
  
  -- Inatividade
  inactivity_timeout_minutes INTEGER DEFAULT 60,
  inactivity_message TEXT,
  
  -- Transferência
  transfer_keywords TEXT[],
  
  -- Agente padrão
  default_ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_assistant_configs IS 'Configurações globais do assistente de IA';

-- -----------------------------------------------------------------------------
-- TENANT_AI_CREDENTIALS (Credenciais de IA do Tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_ai_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai',
  api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_ai_credentials IS 'Chaves de API de provedores de IA por tenant';

-- -----------------------------------------------------------------------------
-- AI_PROVIDER_HEALTH (Saúde dos Provedores de IA)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ai_provider_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error_message TEXT,
  last_error_code TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

COMMENT ON TABLE public.ai_provider_health IS 'Status de saúde dos provedores de IA';

-- -----------------------------------------------------------------------------
-- AI_USAGE_LOGS (Logs de Uso de IA)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage_logs IS 'Logs de uso e consumo de IA';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_ai_agents_agent_type ON public.ai_agents(tenant_id, agent_type);

CREATE INDEX idx_ai_provider_health_tenant ON public.ai_provider_health(tenant_id);

CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs(tenant_id, provider);
CREATE INDEX idx_ai_usage_logs_tenant_created ON public.ai_usage_logs(tenant_id, created_at DESC);

CREATE INDEX idx_tenant_ai_credentials_tenant_id ON public.tenant_ai_credentials(tenant_id);
