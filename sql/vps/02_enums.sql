-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: ENUMS
-- =============================================================================

CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'member');

CREATE TYPE public.module_permission AS ENUM (
  'dashboard', 'sales', 'clients', 'conversations', 'automations',
  'integrations', 'settings', 'coupons', 'products', 'contacts', 'tenants'
);

CREATE TYPE public.instagram_channel_status AS ENUM (
  'connected', 'expiring', 'expired', 'error', 'disconnected'
);

CREATE TYPE public.instagram_delivery_status AS ENUM (
  'pending', 'sent', 'delivered', 'read', 'failed'
);

CREATE TYPE public.instagram_message_direction AS ENUM (
  'incoming', 'outgoing', 'inbound', 'outbound'
);

CREATE TYPE public.instagram_outbox_status AS ENUM (
  'queued', 'processing', 'sent', 'failed', 'dead_letter',
  'pending', 'retry', 'sending', 'dead'
);

CREATE TYPE public.instagram_thread_status AS ENUM (
  'open', 'pending', 'bot_active', 'human_active', 'paused',
  'closed', 'spam', 'blocked'
);
