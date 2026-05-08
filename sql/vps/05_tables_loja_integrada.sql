-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS LOJA INTEGRADA
-- =============================================================================

CREATE TABLE public.li_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_customer_id integer NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  doc text,
  address_json jsonb,
  raw_json jsonb,
  updated_at_remote timestamptz,
  updated_at_local timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_customer_id)
);

CREATE TABLE public.li_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_order_id integer NOT NULL,
  order_number text NOT NULL,
  status_id integer,
  status_name text,
  customer_id uuid REFERENCES public.li_customers(id),
  totals_json jsonb,
  shipping_json jsonb,
  payment_json jsonb,
  items_json jsonb,
  created_at_remote timestamptz,
  updated_at_remote timestamptz,
  raw_json jsonb,
  updated_at_local timestamptz NOT NULL DEFAULT now(),
  last_status_check_at timestamptz,
  UNIQUE(integration_id, loja_integrada_order_id)
);

CREATE TABLE public.li_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id integer,
  sku text,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  price numeric,
  raw_json jsonb
);

CREATE TABLE public.li_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id integer NOT NULL,
  sku text,
  name text NOT NULL,
  price numeric,
  promotional_price numeric,
  cost_price numeric,
  stock integer,
  stock_managed boolean DEFAULT false,
  active boolean DEFAULT true,
  variations_json jsonb,
  image_url text,
  raw_json jsonb,
  updated_at_remote timestamptz,
  updated_at_local timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_product_id)
);

CREATE TABLE public.li_sync_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  last_cursor text,
  last_synced_at timestamptz,
  records_synced integer DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_offset integer DEFAULT 0,
  UNIQUE(integration_id, entity_type)
);

CREATE TABLE public.li_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid REFERENCES public.integrations(id),
  tenant_id uuid REFERENCES public.tenants(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  payload_json jsonb,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  error text,
  dedupe_key text NOT NULL UNIQUE,
  retry_count integer NOT NULL DEFAULT 0
);
