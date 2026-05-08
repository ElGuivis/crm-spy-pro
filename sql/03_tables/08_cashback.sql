-- =============================================================================
-- TABELAS DE CASHBACK E CUPONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CASHBACK_CONFIGS (Configurações de Cashback)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cashback_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  integration_name TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Cashback',
  
  -- Desconto
  discount_percentage NUMERIC NOT NULL DEFAULT 5,
  max_discount_value NUMERIC,
  min_purchase_value NUMERIC,
  coupon_duration_days INTEGER NOT NULL DEFAULT 7,
  
  -- Gatilhos
  trigger_statuses TEXT[] DEFAULT '{}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Canais de envio
  send_via_whatsapp BOOLEAN DEFAULT true,
  send_via_email BOOLEAN DEFAULT false,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  
  -- Templates
  message_template TEXT DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.',
  email_subject TEXT,
  email_body_html TEXT,
  email_body_text TEXT,
  webhook_url TEXT,
  
  -- Lembretes
  reminder_1_enabled BOOLEAN DEFAULT false,
  reminder_1_days_before INTEGER DEFAULT 7,
  reminder_1_message TEXT DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.',
  reminder_2_enabled BOOLEAN DEFAULT false,
  reminder_2_days_before INTEGER DEFAULT 3,
  reminder_2_message TEXT DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashback_configs IS 'Configurações de campanhas de cashback';

-- -----------------------------------------------------------------------------
-- GENERATED_COUPONS (Cupons Gerados)
-- -----------------------------------------------------------------------------
CREATE TABLE public.generated_coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  
  -- Cupom
  coupon_code TEXT NOT NULL,
  coupon_type TEXT, -- 'percentage', 'fixed'
  coupon_value NUMERIC,
  discount_percentage NUMERIC NOT NULL,
  coupon_description TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Loja Integrada
  li_coupon_id INTEGER,
  li_data_inicio TIMESTAMP WITH TIME ZONE,
  li_data_fim TIMESTAMP WITH TIME ZONE,
  li_quantidade_usada INTEGER DEFAULT 0,
  li_quantidade_uso_maximo INTEGER,
  
  -- Cliente
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_cpf TEXT,
  
  -- Pedido origem
  order_id TEXT,
  source TEXT DEFAULT 'cashback', -- 'cashback', 'abandoned_cart', 'manual', 'birthday'
  
  -- Uso
  used_at TIMESTAMP WITH TIME ZONE,
  used_in_order_id TEXT,
  used_order_value NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.generated_coupons IS 'Cupons gerados pelo sistema';

-- -----------------------------------------------------------------------------
-- CASHBACK_REMINDERS (Lembretes de Cashback)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cashback_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  coupon_id UUID NOT NULL REFERENCES public.generated_coupons(id) ON DELETE CASCADE,
  reminder_number INTEGER NOT NULL, -- 1 ou 2
  message TEXT,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  webhook_url TEXT,
  webhook_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashback_reminders IS 'Lembretes agendados de cupons';

-- -----------------------------------------------------------------------------
-- CASHBACK_EXECUTIONS (Log de Execuções)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cashback_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  coupon_id UUID REFERENCES public.generated_coupons(id) ON DELETE SET NULL,
  reminder_id UUID REFERENCES public.cashback_reminders(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- 'coupon_created', 'coupon_sent', 'reminder_sent', 'coupon_used'
  order_id TEXT,
  order_number TEXT,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  tokens_used INTEGER DEFAULT 1,
  metadata JSONB,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashback_executions IS 'Log de execuções do sistema de cashback';

-- -----------------------------------------------------------------------------
-- CASHBACK_BALANCES (Saldos de Cashback)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cashback_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashback_balances IS 'Saldos de cashback por cliente';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_cashback_configs_integration_id ON public.cashback_configs(integration_id);

CREATE INDEX idx_generated_coupons_integration_id ON public.generated_coupons(integration_id);
CREATE INDEX idx_generated_coupons_li_coupon_id ON public.generated_coupons(li_coupon_id);
CREATE INDEX idx_generated_coupons_source ON public.generated_coupons(source);

CREATE INDEX idx_cashback_reminders_coupon ON public.cashback_reminders(coupon_id);
CREATE INDEX idx_cashback_reminders_pending ON public.cashback_reminders(scheduled_date, status) WHERE status = 'pending';

CREATE INDEX idx_cashback_executions_config ON public.cashback_executions(config_id);
CREATE INDEX idx_cashback_executions_coupon ON public.cashback_executions(coupon_id);
CREATE INDEX idx_cashback_executions_action ON public.cashback_executions(action_type);
CREATE INDEX idx_cashback_executions_date ON public.cashback_executions(executed_at DESC);
