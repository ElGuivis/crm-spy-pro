
-- Create abandoned_cart_configs table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  delay_minutes integer NOT NULL DEFAULT 120,
  message_template text DEFAULT 'Olá {nome}, notamos que você deixou itens no carrinho! Complete sua compra agora.',
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  coupon_enabled boolean DEFAULT false,
  coupon_discount_percent numeric DEFAULT 10,
  coupon_duration_days integer DEFAULT 7,
  max_attempts integer DEFAULT 2,
  tokens_per_execution integer DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create abandoned_carts table
CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.abandoned_cart_configs(id),
  external_id text NOT NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  cart_total numeric DEFAULT 0,
  checkout_url text,
  abandoned_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  contacted_at timestamptz,
  recovered_at timestamptz,
  recovery_order_id text,
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, external_id)
);

-- Create abandoned_cart_executions table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.abandoned_cart_configs(id),
  cart_id uuid REFERENCES public.abandoned_carts(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT 'whatsapp_reminder',
  status text NOT NULL DEFAULT 'pending',
  customer_name text,
  customer_phone text,
  customer_email text,
  coupon_code text,
  error_message text,
  tokens_used integer DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.abandoned_cart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for abandoned_cart_configs
CREATE POLICY "Tenant members can view abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for abandoned_carts
CREATE POLICY "Tenant members can view abandoned_carts" ON public.abandoned_carts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage abandoned_carts" ON public.abandoned_carts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role needs access (for edge functions)
CREATE POLICY "Service role full access on abandoned_carts" ON public.abandoned_carts
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on abandoned_cart_executions" ON public.abandoned_cart_executions
  FOR ALL TO service_role USING (true);

-- RLS Policies for abandoned_cart_executions
CREATE POLICY "Tenant members can view abandoned_cart_executions" ON public.abandoned_cart_executions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
