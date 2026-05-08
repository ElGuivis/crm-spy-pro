-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS IA
-- =============================================================================

CREATE TABLE public.ai_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  welcome_message text,
  transfer_keywords text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data_access jsonb DEFAULT '{"orders": true, "coupons": true, "cashback": false, "products": false, "order_items": true, "smart_search": true, "order_tracking": true, "abandoned_carts": true, "customer_details": true, "products_catalog": false, "products_featured": false}',
  agent_transfer_rules jsonb DEFAULT '[]',
  interactive_buttons jsonb DEFAULT '[]',
  human_transfer_column_id uuid REFERENCES public.kanban_columns(id),
  inactivity_enabled boolean DEFAULT false,
  inactivity_timeout_minutes integer,
  inactivity_target_column_id uuid REFERENCES public.kanban_columns(id),
  inactivity_message text DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!',
  keyword_action_rules jsonb DEFAULT '[]',
  message_buffer_enabled boolean DEFAULT false,
  message_buffer_delay_seconds integer DEFAULT 10,
  store_integration_id uuid REFERENCES public.integrations(id),
  order_verification_enabled boolean DEFAULT false,
  order_verification_mode text DEFAULT 'sequential',
  order_verification_messages jsonb DEFAULT '{"ask_cpf": "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.", "ask_both": "Para consultar seu pedido, por favor informe:\\n\\n1️⃣ *Número do pedido*\\n2️⃣ *3 primeiros dígitos do CPF* cadastrado", "cpf_wrong": "❌ CPF incorreto. Por favor, tente novamente.\\n\\n_(Tentativa {attempts}/3)_", "after_verified": "Posso ajudar com mais alguma coisa sobre este pedido?", "order_verified": "✅ *Pedido encontrado!*\\n\\n{order_details}", "order_not_found": "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\\n\\nPor favor, verifique o número e tente novamente.", "ask_order_number": "Por favor, informe o *número do pedido* para que eu possa consultar.", "cpf_max_attempts": "⚠️ Você excedeu o número máximo de tentativas.\\n\\nVou transferir você para um de nossos atendentes que poderá ajudá-lo."}',
  order_details_template text,
  order_not_found_column_id uuid REFERENCES public.kanban_columns(id),
  cpf_max_attempts_column_id uuid REFERENCES public.kanban_columns(id),
  after_verified_column_id uuid REFERENCES public.kanban_columns(id),
  verification_type text DEFAULT 'order',
  tracking_link_base text,
  agent_type text NOT NULL DEFAULT 'chatbot',
  ai_provider text
);

CREATE TABLE public.ai_agent_column_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(column_id, tenant_id)
);

CREATE TABLE public.ai_assistant_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  system_prompt text,
  welcome_message text DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo?',
  transfer_keywords text[] DEFAULT ARRAY['atendente', 'humano', 'pessoa', 'falar com alguém'],
  business_hours jsonb DEFAULT '{"enabled": false}',
  out_of_hours_message text DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  max_context_messages integer DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  default_ai_agent_id uuid REFERENCES public.ai_agents(id),
  inactivity_timeout_minutes integer,
  inactivity_message text DEFAULT 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!'
);

CREATE TABLE public.tenant_ai_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lovable',
  api_key_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE public.ai_provider_health (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_error_code text,
  last_error_message text,
  last_check_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE TABLE public.ai_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'lovable',
  model text NOT NULL,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  tokens_total integer,
  agent_id uuid REFERENCES public.ai_agents(id),
  conversation_id uuid REFERENCES public.conversations(id),
  response_time_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
