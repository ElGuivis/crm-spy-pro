-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS WHATSAPP/ATENDIMENTO
-- =============================================================================

-- WhatsApp Channels
CREATE TABLE public.whatsapp_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  phone_e164 text,
  provider_account_id text,
  waba_id text,
  status text NOT NULL DEFAULT 'disconnected',
  webhook_secret text,
  access_token text,
  metadata_json jsonb DEFAULT '{}',
  integration_id uuid REFERENCES public.integrations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kanban Columns
CREATE TABLE public.kanban_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'bg-blue-500',
  position integer NOT NULL DEFAULT 0,
  is_default_for_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contacts
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  li_customer_id uuid,
  phone varchar NOT NULL,
  name varchar,
  email varchar,
  avatar_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Inboxes
CREATE TABLE public.inboxes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  bot_enabled boolean NOT NULL DEFAULT false,
  sla_first_response_minutes integer,
  sla_resolution_minutes integer,
  business_hours_json jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ai_agent_id uuid,
  integration_id uuid REFERENCES public.integrations(id)
);

-- Conversations
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id),
  chatwoot_conversation_id integer,
  status varchar NOT NULL DEFAULT 'bot',
  assigned_to uuid,
  ai_enabled boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  kanban_column_id uuid REFERENCES public.kanban_columns(id),
  current_ai_agent_id uuid,
  pending_ai_response_at timestamptz,
  buffered_message_ids uuid[] DEFAULT '{}',
  verification_state text,
  verification_data jsonb,
  awaiting_phone_input boolean DEFAULT false,
  lead_capture_state text,
  lead_capture_data jsonb DEFAULT '{}',
  last_incoming_message_id text,
  inbox_id uuid REFERENCES public.inboxes(id),
  channel_id uuid REFERENCES public.whatsapp_channels(id),
  handoff_mode boolean NOT NULL DEFAULT false,
  bot_state_json jsonb,
  priority text NOT NULL DEFAULT 'normal',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  closed_at timestamptz
);

-- Messages
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chatwoot_message_id integer,
  sender_type varchar NOT NULL,
  sender_id uuid,
  content text NOT NULL,
  content_type varchar NOT NULL DEFAULT 'text',
  media_url text,
  metadata jsonb DEFAULT '{}',
  status varchar NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL DEFAULT 'inbound',
  provider_message_id text,
  error_json jsonb,
  type text NOT NULL DEFAULT 'text'
);

-- Notification Settings
CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sound_enabled boolean NOT NULL DEFAULT true,
  sound_volume numeric DEFAULT 0.5,
  desktop_notifications boolean NOT NULL DEFAULT true,
  new_message_sound text DEFAULT 'default',
  new_conversation_sound text DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quick Replies
CREATE TABLE public.quick_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category text,
  shortcut text,
  usage_count integer DEFAULT 0,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Outbound Queue
CREATE TABLE public.outbound_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id),
  channel_id uuid NOT NULL REFERENCES public.whatsapp_channels(id),
  to_phone_e164 text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Message Queue (async)
CREATE TABLE public.message_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  recipient text NOT NULL,
  message_content text NOT NULL,
  subject text,
  html_content text,
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  email_integration_id uuid REFERENCES public.email_integrations(id),
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  reference_type text,
  reference_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
