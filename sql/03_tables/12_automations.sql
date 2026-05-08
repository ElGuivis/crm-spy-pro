-- =============================================================================
-- TABELAS DE AUTOMAÇÕES - Mensagens Automáticas, Notificações, Horário Comercial
-- =============================================================================

-- -----------------------------------------------------------------------------
-- AUTO_MESSAGES (Mensagens Automáticas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.auto_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  delay_seconds INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.auto_messages IS 'Mensagens automáticas configuráveis';

-- -----------------------------------------------------------------------------
-- BUSINESS_HOURS (Horário Comercial)
-- -----------------------------------------------------------------------------
CREATE TABLE public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, day_of_week)
);

COMMENT ON TABLE public.business_hours IS 'Configuração de horário comercial por dia da semana';

-- -----------------------------------------------------------------------------
-- ORDER_NOTIFICATION_CONFIGS (Configurações de Notificação de Pedidos)
-- NOTA: Usa send_via_whatsapp/send_via_email e tokens_per_execution
-- -----------------------------------------------------------------------------
CREATE TABLE public.order_notification_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Notificação de Pedidos',
  is_active BOOLEAN DEFAULT false,
  
  -- Canais
  send_via_whatsapp BOOLEAN DEFAULT true,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  send_via_email BOOLEAN DEFAULT false,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  
  -- Tokens
  tokens_per_execution INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.order_notification_configs IS 'Configurações gerais de notificação de pedidos';

-- -----------------------------------------------------------------------------
-- ORDER_NOTIFICATION_STATUS_RULES (Regras por Status)
-- -----------------------------------------------------------------------------
CREATE TABLE public.order_notification_status_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES public.order_notification_configs(id) ON DELETE CASCADE,
  status_id INTEGER,
  status_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  delay_minutes INTEGER DEFAULT 0,
  message_template TEXT NOT NULL,
  email_subject TEXT,
  email_body TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(config_id, status_name)
);

COMMENT ON TABLE public.order_notification_status_rules IS 'Regras de notificação por status de pedido';

-- -----------------------------------------------------------------------------
-- ORDER_NOTIFICATION_EXECUTIONS (Log de Execuções)
-- -----------------------------------------------------------------------------
CREATE TABLE public.order_notification_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.order_notification_configs(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.order_notification_status_rules(id) ON DELETE SET NULL,
  order_id TEXT NOT NULL,
  order_number TEXT,
  status_name TEXT,
  channel TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  message_sent TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.order_notification_executions IS 'Log de notificações enviadas';

-- -----------------------------------------------------------------------------
-- MESSAGE_QUEUE (Fila de Mensagens)
-- -----------------------------------------------------------------------------
CREATE TABLE public.message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message_content TEXT NOT NULL,
  subject TEXT,
  html_content TEXT,
  
  -- Integrações
  whatsapp_integration_id UUID,
  email_integration_id UUID,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Referência
  reference_type TEXT,
  reference_id TEXT,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.message_queue IS 'Fila de mensagens para envio assíncrono';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_auto_messages_tenant_id ON public.auto_messages(tenant_id);
CREATE INDEX idx_auto_messages_type ON public.auto_messages(message_type);

CREATE INDEX idx_business_hours_tenant_id ON public.business_hours(tenant_id);

CREATE INDEX idx_order_notification_configs_tenant_id ON public.order_notification_configs(tenant_id);
CREATE INDEX idx_order_notification_configs_integration_id ON public.order_notification_configs(integration_id);

CREATE INDEX idx_order_notification_status_rules_config_id ON public.order_notification_status_rules(config_id);

CREATE INDEX idx_order_notification_executions_tenant_id ON public.order_notification_executions(tenant_id);
CREATE INDEX idx_order_notification_executions_order_id ON public.order_notification_executions(order_id);

CREATE INDEX idx_message_queue_status ON public.message_queue(status);
CREATE INDEX idx_message_queue_next_retry ON public.message_queue(next_retry_at);
CREATE INDEX idx_message_queue_tenant_id ON public.message_queue(tenant_id);
