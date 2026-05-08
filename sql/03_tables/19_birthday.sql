-- =============================================================================
-- TABELAS DE AUTOMAÇÃO DE ANIVERSARIANTES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BIRTHDAY_CONFIGS (Configuração de Aniversariantes)
-- -----------------------------------------------------------------------------
CREATE TABLE public.birthday_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Aniversariantes',
  is_active BOOLEAN NOT NULL DEFAULT false,
  coupon_discount_percent NUMERIC NOT NULL DEFAULT 10,
  coupon_duration_days INTEGER NOT NULL DEFAULT 30,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_enabled BOOLEAN DEFAULT false,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT 'Feliz Aniversário! 🎂',
  email_body TEXT,
  message_template TEXT NOT NULL DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!',
  tokens_per_execution INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.birthday_configs IS 'Configuração de automação de aniversariantes';

-- -----------------------------------------------------------------------------
-- BIRTHDAY_EXECUTIONS (Execuções de Aniversariantes)
-- -----------------------------------------------------------------------------
CREATE TABLE public.birthday_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.birthday_configs(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_source TEXT, -- 'li_customers', 'bling_customers'
  coupon_code TEXT,
  action_type TEXT NOT NULL DEFAULT 'birthday_message',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  tokens_used INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.birthday_executions IS 'Execuções de mensagens de aniversário';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_birthday_configs_tenant_id ON public.birthday_configs(tenant_id);
CREATE INDEX idx_birthday_configs_integration_id ON public.birthday_configs(integration_id);
CREATE INDEX idx_birthday_executions_tenant_id ON public.birthday_executions(tenant_id);
CREATE INDEX idx_birthday_executions_config_id ON public.birthday_executions(config_id);
CREATE INDEX idx_birthday_executions_status ON public.birthday_executions(status);
