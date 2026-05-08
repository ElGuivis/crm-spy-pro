-- Table for order notification automation configurations
CREATE TABLE public.order_notification_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Notificação de Pedido',
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  whatsapp_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_integration_id uuid REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  send_via_whatsapp boolean DEFAULT true,
  send_via_email boolean DEFAULT false,
  is_active boolean DEFAULT true,
  tokens_per_execution integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table for status-specific notification rules
CREATE TABLE public.order_notification_status_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.order_notification_configs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status_name text NOT NULL,
  status_id integer,
  is_enabled boolean DEFAULT true,
  message_template text NOT NULL,
  email_subject text,
  email_body text,
  delay_minutes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table for execution history/logs
CREATE TABLE public.order_notification_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.order_notification_configs(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.order_notification_status_rules(id) ON DELETE SET NULL,
  order_id text NOT NULL,
  order_number text,
  customer_phone text,
  customer_email text,
  status_name text,
  message_sent text,
  channel text DEFAULT 'whatsapp',
  status text DEFAULT 'pending',
  error_message text,
  tokens_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_notification_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_status_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for order_notification_configs
CREATE POLICY "Tenant admins can manage order_notification_configs"
ON public.order_notification_configs FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_configs"
ON public.order_notification_configs FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_configs"
ON public.order_notification_configs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for order_notification_status_rules
CREATE POLICY "Tenant admins can manage order_notification_status_rules"
ON public.order_notification_status_rules FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_status_rules"
ON public.order_notification_status_rules FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_status_rules"
ON public.order_notification_status_rules FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for order_notification_executions
CREATE POLICY "Tenant admins can manage order_notification_executions"
ON public.order_notification_executions FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_executions"
ON public.order_notification_executions FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_executions"
ON public.order_notification_executions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_order_notification_configs_tenant ON public.order_notification_configs(tenant_id);
CREATE INDEX idx_order_notification_configs_integration ON public.order_notification_configs(integration_id);
CREATE INDEX idx_order_notification_status_rules_config ON public.order_notification_status_rules(config_id);
CREATE INDEX idx_order_notification_status_rules_status ON public.order_notification_status_rules(status_name);
CREATE INDEX idx_order_notification_executions_tenant ON public.order_notification_executions(tenant_id);
CREATE INDEX idx_order_notification_executions_order ON public.order_notification_executions(order_id);
CREATE INDEX idx_order_notification_executions_created ON public.order_notification_executions(created_at DESC);