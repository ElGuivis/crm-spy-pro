-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS CORE
-- =============================================================================

-- Tenants (multi-tenant)
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  company_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  owner_name text
);

-- Team Members
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role team_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Member Permissions
CREATE TABLE public.member_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  permission module_permission NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Token Plans
CREATE TABLE public.token_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  tokens integer NOT NULL,
  price numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant Tokens
CREATE TABLE public.tenant_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  plan_id uuid REFERENCES public.token_plans(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Token Transactions
CREATE TABLE public.token_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  reference_id text,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Integrations
CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  api_key text,
  status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_orders_sync_at timestamptz,
  last_customers_sync_at timestamptz,
  last_products_sync_at timestamptz,
  last_carts_sync_at timestamptz,
  initial_sync_completed boolean DEFAULT false,
  bling_store_ids int4[],
  auto_sync_enabled boolean DEFAULT true,
  auto_sync_interval_minutes integer DEFAULT 5,
  auto_sync_orders boolean DEFAULT true,
  auto_sync_customers boolean DEFAULT true,
  auto_sync_products boolean DEFAULT true,
  auto_sync_carts boolean DEFAULT true,
  auto_sync_coupons boolean DEFAULT true,
  auto_sync_shipments boolean DEFAULT true,
  last_auto_sync_at timestamptz,
  auto_sync_orders_interval integer DEFAULT 5,
  auto_sync_customers_interval integer DEFAULT 5,
  auto_sync_products_interval integer DEFAULT 5,
  auto_sync_carts_interval integer DEFAULT 5,
  auto_sync_coupons_interval integer DEFAULT 5,
  auto_sync_shipments_interval integer DEFAULT 5,
  last_sync_orders_at timestamptz,
  last_sync_customers_at timestamptz,
  last_sync_products_at timestamptz,
  last_sync_carts_at timestamptz,
  last_sync_coupons_at timestamptz,
  last_sync_shipments_at timestamptz,
  store_integration_id uuid
);

-- Email Integrations
CREATE TABLE public.email_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sender_email text NOT NULL,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_user text NOT NULL,
  smtp_password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE
);
