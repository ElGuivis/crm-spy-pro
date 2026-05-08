
CREATE TABLE public.reactivation_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Reativação de Clientes',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  inactivity_days INTEGER NOT NULL DEFAULT 30,
  coupon_discount_percent NUMERIC NOT NULL DEFAULT 10,
  coupon_duration_days INTEGER NOT NULL DEFAULT 7,
  message_template TEXT NOT NULL DEFAULT 'Olá {nome}! Sentimos sua falta 💜 Aqui está um cupom de {desconto}% para sua próxima compra: {cupom}. Válido por {dias} dias!',
  is_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMP WITH TIME ZONE,
  tokens_per_execution INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.reactivation_configs IS 'Configurações de reativação de clientes inativos';
CREATE INDEX idx_reactivation_configs_tenant_id ON public.reactivation_configs(tenant_id);

CREATE TABLE public.reactivation_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.reactivation_configs(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  coupon_code TEXT,
  last_order_date TIMESTAMP WITH TIME ZONE,
  days_inactive INTEGER,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.reactivation_executions IS 'Log de execuções de reativação';
CREATE INDEX idx_reactivation_executions_tenant_id ON public.reactivation_executions(tenant_id);
CREATE INDEX idx_reactivation_executions_config_id ON public.reactivation_executions(config_id);

ALTER TABLE public.reactivation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactivation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for reactivation_configs"
  ON public.reactivation_configs FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant isolation for reactivation_executions"
  ON public.reactivation_executions FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
