-- Create abandoned_cart_configs table for automation settings
CREATE TABLE public.abandoned_cart_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Carrinho Abandonado',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT NOT NULL DEFAULT 'Olá {{cliente_primeiro_nome}}! 👋

Notamos que você deixou alguns produtos no carrinho. Seu pedido de {{valor_carrinho}} está esperando por você!

🛒 Finalize sua compra: {{link_checkout}}

{{cupom_texto}}

Qualquer dúvida, estamos aqui para ajudar! 😊',
  delay_minutes INTEGER NOT NULL DEFAULT 30,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_delay_hours INTEGER DEFAULT 24,
  reminder_message_template TEXT,
  min_cart_value NUMERIC(10,2) DEFAULT 0,
  include_coupon BOOLEAN NOT NULL DEFAULT false,
  coupon_discount_percent INTEGER DEFAULT 10,
  coupon_duration_days INTEGER DEFAULT 3,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  email_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT 'Você esqueceu algo no carrinho! 🛒',
  email_body TEXT,
  tokens_per_execution INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create abandoned_carts table to store cart data
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.abandoned_cart_configs(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  cart_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cart_items JSONB DEFAULT '[]'::jsonb,
  checkout_url TEXT,
  abandoned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_contact_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'reminder_sent', 'recovered', 'expired', 'cancelled')),
  first_contact_at TIMESTAMP WITH TIME ZONE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  recovered_at TIMESTAMP WITH TIME ZONE,
  recovered_order_id TEXT,
  coupon_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, integration_id, external_id)
);

-- Create abandoned_cart_executions table for logging
CREATE TABLE public.abandoned_cart_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.abandoned_cart_configs(id) ON DELETE SET NULL,
  cart_id UUID REFERENCES public.abandoned_carts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('message_sent', 'reminder_sent', 'coupon_created', 'email_sent', 'cart_recovered')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  tokens_used INTEGER DEFAULT 0,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.abandoned_cart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for abandoned_cart_configs
CREATE POLICY "Users can view their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned cart configs for their tenant"
  ON public.abandoned_cart_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for abandoned_carts
CREATE POLICY "Users can view their tenant's abandoned carts"
  ON public.abandoned_carts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned carts for their tenant"
  ON public.abandoned_carts FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned carts"
  ON public.abandoned_carts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for abandoned_cart_executions
CREATE POLICY "Users can view their tenant's abandoned cart executions"
  ON public.abandoned_cart_executions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "Service role can manage abandoned_cart_configs"
  ON public.abandoned_cart_configs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage abandoned_carts"
  ON public.abandoned_carts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage abandoned_cart_executions"
  ON public.abandoned_cart_executions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_abandoned_carts_tenant_status ON public.abandoned_carts(tenant_id, status);
CREATE INDEX idx_abandoned_carts_scheduled_contact ON public.abandoned_carts(scheduled_contact_at) WHERE status = 'pending';
CREATE INDEX idx_abandoned_cart_configs_tenant ON public.abandoned_cart_configs(tenant_id);
CREATE INDEX idx_abandoned_cart_executions_config ON public.abandoned_cart_executions(config_id);

-- Triggers for updated_at
CREATE TRIGGER update_abandoned_cart_configs_updated_at
  BEFORE UPDATE ON public.abandoned_cart_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();