
-- =============================================
-- FASE 6: Advanced Features Tables
-- =============================================

-- 6.1 Contact Custom Fields (schema definition per tenant)
CREATE TABLE public.contact_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb DEFAULT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_custom_fields
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.2 Contact Custom Field Values
CREATE TABLE public.contact_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.contact_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, field_id)
);

ALTER TABLE public.contact_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_custom_field_values
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.3 CRM Segments (dynamic audiences)
CREATE TABLE public.crm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_count int NOT NULL DEFAULT 0,
  last_computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.crm_segments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.4 Tenant Webhooks
CREATE TABLE public.tenant_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_webhooks
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.5 Tenant API Keys
CREATE TABLE public.tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_api_keys
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.6 White Label Settings
CREATE TABLE public.tenant_whitelabel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  company_name text,
  logo_url text,
  favicon_url text,
  colors jsonb NOT NULL DEFAULT '{"primary":"#6d28d9","secondary":"#a855f7","accent":"#f59e0b","background":"#0f0f23","foreground":"#ffffff"}'::jsonb,
  custom_domain text,
  domain_verified boolean NOT NULL DEFAULT false,
  hide_branding boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_whitelabel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_whitelabel
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.7 Inbox Routing Rules
CREATE TABLE public.inbox_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL,
  condition_type text NOT NULL DEFAULT 'all',
  condition_value text,
  target_inbox_id uuid,
  target_type text NOT NULL DEFAULT 'inbox',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.inbox_routing_rules
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.8 Contact Merges (cross-channel)
CREATE TABLE public.contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  merged_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  similarity_score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested',
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_merges
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
