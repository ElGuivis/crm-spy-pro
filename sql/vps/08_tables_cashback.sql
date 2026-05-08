-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS CASHBACK/CUPONS
-- =============================================================================

CREATE TABLE public.cashback_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_name text NOT NULL,
  discount_percentage numeric NOT NULL DEFAULT 5,
  coupon_duration_days integer NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  min_purchase_value numeric,
  max_discount_value numeric,
  trigger_statuses text[] DEFAULT '{}',
  webhook_url text,
  send_via_whatsapp boolean DEFAULT true,
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  message_template text DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.',
  name text NOT NULL DEFAULT 'Cashback',
  send_via_email boolean DEFAULT false,
  email_integration_id uuid REFERENCES public.email_integrations(id),
  email_subject text,
  email_body_text text,
  email_body_html text,
  reminder_1_enabled boolean DEFAULT false,
  reminder_1_days_before integer DEFAULT 7,
  reminder_1_message text DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.',
  reminder_2_enabled boolean DEFAULT false,
  reminder_2_days_before integer DEFAULT 3,
  reminder_2_message text DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id)
);

CREATE TABLE public.generated_coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid REFERENCES public.cashback_configs(id),
  coupon_code text NOT NULL,
  discount_percentage numeric NOT NULL,
  customer_email text,
  customer_phone text,
  order_id text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  customer_name text,
  customer_cpf text,
  coupon_value numeric,
  used_in_order_id text,
  used_order_value numeric,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id),
  li_coupon_id integer,
  source text DEFAULT 'cashback',
  coupon_type text,
  coupon_description text,
  li_data_inicio timestamptz,
  li_data_fim timestamptz,
  li_quantidade_uso_maximo integer,
  li_quantidade_usada integer DEFAULT 0
);

CREATE TABLE public.cashback_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES public.generated_coupons(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.cashback_configs(id),
  reminder_number integer NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  webhook_url text,
  webhook_payload jsonb,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE public.cashback_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid REFERENCES public.cashback_configs(id),
  coupon_id uuid REFERENCES public.generated_coupons(id),
  reminder_id uuid REFERENCES public.cashback_reminders(id),
  order_id text,
  order_number text,
  coupon_code text,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  tokens_used integer DEFAULT 1,
  metadata jsonb,
  executed_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE public.cashback_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
