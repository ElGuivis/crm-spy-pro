-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS AUTOMAÇÕES, LEADS, CAMPANHAS, TAGS, ETC
-- =============================================================================

-- Auto Messages
CREATE TABLE public.auto_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_type text NOT NULL,
  content text NOT NULL,
  is_active boolean DEFAULT true,
  delay_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, message_type)
);

-- Business Hours
CREATE TABLE public.business_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time time NOT NULL DEFAULT '09:00:00',
  end_time time NOT NULL DEFAULT '18:00:00',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, day_of_week)
);

-- Order Notification Configs
CREATE TABLE public.order_notification_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Notificação de Pedido',
  integration_id uuid REFERENCES public.integrations(id),
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  email_integration_id uuid REFERENCES public.email_integrations(id),
  send_via_whatsapp boolean DEFAULT true,
  send_via_email boolean DEFAULT false,
  is_active boolean DEFAULT true,
  tokens_per_execution integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Order Notification Status Rules
CREATE TABLE public.order_notification_status_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Order Notification Executions
CREATE TABLE public.order_notification_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.order_notification_configs(id),
  rule_id uuid REFERENCES public.order_notification_status_rules(id),
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

-- Leads
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id),
  conversation_id uuid REFERENCES public.conversations(id),
  integration_id uuid REFERENCES public.integrations(id),
  name text,
  phone text,
  email text,
  source text DEFAULT 'receptionist',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Receptionist Configs
CREATE TABLE public.receptionist_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Recepcionista Virtual',
  is_active boolean NOT NULL DEFAULT false,
  welcome_message text NOT NULL DEFAULT 'Olá! 👋 Bem-vindo(a)! Como posso ajudá-lo(a) hoje?',
  menu_format text NOT NULL DEFAULT 'buttons',
  list_title text DEFAULT 'Escolha uma opção',
  list_button_text text DEFAULT 'Ver opções',
  menu_options jsonb NOT NULL DEFAULT '[{"id": "1", "label": "Falar com atendente", "action_type": "transfer_to_human"}]',
  menu_trigger_keywords jsonb NOT NULL DEFAULT '["menu", "opções", "opcoes"]',
  human_handoff_message text NOT NULL DEFAULT 'Entendido! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  target_column_id uuid REFERENCES public.kanban_columns(id),
  lead_capture_enabled boolean DEFAULT false,
  lead_capture_name_message text DEFAULT 'Para um melhor atendimento, qual é o seu nome? 😊',
  lead_capture_phone_message text DEFAULT 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:',
  lead_capture_success_message text DEFAULT 'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...'
);

-- Bulk Campaigns
CREATE TABLE public.bulk_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  message_template text NOT NULL,
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  delay_seconds integer NOT NULL DEFAULT 10,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_contacts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  tokens_per_message integer NOT NULL DEFAULT 2,
  total_tokens_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  media_url text,
  media_type text DEFAULT 'text',
  delay_max_seconds integer DEFAULT 360,
  timezone text DEFAULT 'America/Sao_Paulo',
  sending_schedule jsonb
);

-- Campaign Contacts
CREATE TABLE public.campaign_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text,
  phone text NOT NULL,
  variables jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  whatsapp_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tags
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Conversation Tags
CREATE TABLE public.conversation_tags (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

-- Contact Blocks
CREATE TABLE public.contact_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

-- Conversation Events
CREATE TABLE public.conversation_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid,
  payload_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- OAuth States
CREATE TABLE public.oauth_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'meta',
  redirect_path text DEFAULT '/integrations',
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  frontend_url text
);

-- Webhook Events
CREATE TABLE public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  provider text NOT NULL,
  channel_id uuid REFERENCES public.whatsapp_channels(id),
  event_type text NOT NULL,
  provider_message_id text,
  payload_json jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Birthday Configs
CREATE TABLE public.birthday_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Aniversariantes',
  is_active boolean NOT NULL DEFAULT false,
  coupon_discount_percent numeric NOT NULL DEFAULT 10,
  coupon_duration_days integer NOT NULL DEFAULT 30,
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  email_enabled boolean DEFAULT false,
  email_integration_id uuid REFERENCES public.email_integrations(id),
  email_subject text DEFAULT 'Feliz Aniversário! 🎂',
  email_body text,
  message_template text NOT NULL DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!',
  tokens_per_execution integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Birthday Executions
CREATE TABLE public.birthday_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.birthday_configs(id),
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_source text,
  coupon_code text,
  action_type text NOT NULL DEFAULT 'birthday_message',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  tokens_used integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
