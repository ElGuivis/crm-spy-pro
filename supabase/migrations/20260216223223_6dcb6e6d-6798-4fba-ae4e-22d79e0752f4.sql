
-- =============================================================================
-- AUTOMAÇÃO DE ANIVERSARIANTES
-- =============================================================================

-- birthday_configs: Configurações de automação de aniversário
CREATE TABLE public.birthday_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Aniversariantes',
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- Cupom
  coupon_discount_percent NUMERIC NOT NULL DEFAULT 10,
  coupon_duration_days INTEGER NOT NULL DEFAULT 30,

  -- Canais
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_enabled BOOLEAN DEFAULT false,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT 'Feliz Aniversário! 🎂',
  email_body TEXT,

  -- Template
  message_template TEXT NOT NULL DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!',

  -- Tokens
  tokens_per_execution INTEGER NOT NULL DEFAULT 3,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant birthday configs"
  ON public.birthday_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant birthday configs"
  ON public.birthday_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant birthday configs"
  ON public.birthday_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant birthday configs"
  ON public.birthday_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- birthday_executions: Log de execuções
CREATE TABLE public.birthday_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.birthday_configs(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_source TEXT, -- 'loja_integrada' or 'bling'
  coupon_code TEXT,
  action_type TEXT NOT NULL DEFAULT 'birthday_message', -- 'birthday_message'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
  error_message TEXT,
  tokens_used INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant birthday executions"
  ON public.birthday_executions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage birthday executions"
  ON public.birthday_executions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_birthday_configs_tenant_id ON public.birthday_configs(tenant_id);
CREATE INDEX idx_birthday_configs_integration_id ON public.birthday_configs(integration_id);
CREATE INDEX idx_birthday_executions_tenant_id ON public.birthday_executions(tenant_id);
CREATE INDEX idx_birthday_executions_created_at ON public.birthday_executions(created_at DESC);

-- Trigger updated_at
CREATE TRIGGER update_birthday_configs_updated_at
  BEFORE UPDATE ON public.birthday_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
