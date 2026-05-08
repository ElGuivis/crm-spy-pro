
-- ============================================================
-- Backfill CREATE TABLE IF NOT EXISTS for 7 tables that exist
-- in production but had no migration-tracked DDL.
-- This brings FULL_MIGRATION.sql in sync with types.ts.
-- ============================================================

-- Enums (IF NOT EXISTS via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_status') THEN
    CREATE TYPE public.email_campaign_status AS ENUM ('draft','scheduled','sending','sent','paused','canceled','error');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_type') THEN
    CREATE TYPE public.email_campaign_type AS ENUM ('newsletter','promotion','relationship','automation','update');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_template_type') THEN
    CREATE TYPE public.email_template_type AS ENUM ('newsletter','promotional','reactivation','launch','relationship');
  END IF;
END $$;

-- 1. cashback_configs
CREATE TABLE IF NOT EXISTS public.cashback_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  integration_name TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Cashback',
  discount_percentage NUMERIC NOT NULL DEFAULT 5,
  coupon_duration_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT false,
  min_purchase_value NUMERIC DEFAULT NULL,
  max_discount_value NUMERIC DEFAULT NULL,
  trigger_statuses TEXT[] DEFAULT '{}',
  webhook_url TEXT DEFAULT NULL,
  send_via_whatsapp BOOLEAN DEFAULT true,
  send_via_email BOOLEAN DEFAULT false,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT NULL,
  email_body_html TEXT DEFAULT NULL,
  email_body_text TEXT DEFAULT NULL,
  message_template TEXT DEFAULT NULL,
  reminder_1_enabled BOOLEAN DEFAULT false,
  reminder_1_days_before INTEGER DEFAULT NULL,
  reminder_1_message TEXT DEFAULT NULL,
  reminder_2_enabled BOOLEAN DEFAULT false,
  reminder_2_days_before INTEGER DEFAULT NULL,
  reminder_2_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashback_configs ENABLE ROW LEVEL SECURITY;

-- 2. generated_coupons
CREATE TABLE IF NOT EXISTS public.generated_coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  coupon_code TEXT NOT NULL,
  coupon_type TEXT DEFAULT NULL,
  coupon_value NUMERIC DEFAULT NULL,
  coupon_description TEXT DEFAULT NULL,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  customer_name TEXT DEFAULT NULL,
  customer_email TEXT DEFAULT NULL,
  customer_phone TEXT DEFAULT NULL,
  customer_cpf TEXT DEFAULT NULL,
  order_id TEXT DEFAULT NULL,
  source TEXT DEFAULT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_in_order_id TEXT DEFAULT NULL,
  used_order_value NUMERIC DEFAULT NULL,
  li_coupon_id BIGINT DEFAULT NULL,
  li_data_inicio TEXT DEFAULT NULL,
  li_data_fim TEXT DEFAULT NULL,
  li_quantidade_uso_maximo INTEGER DEFAULT NULL,
  li_quantidade_usada INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_coupons ENABLE ROW LEVEL SECURITY;

-- 3. email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  template_type public.email_template_type NOT NULL DEFAULT 'newsletter',
  content_html TEXT DEFAULT NULL,
  content_json JSONB DEFAULT NULL,
  thumbnail_url TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- 4. email_campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  internal_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  reply_to TEXT DEFAULT NULL,
  preheader TEXT DEFAULT NULL,
  campaign_type public.email_campaign_type NOT NULL DEFAULT 'newsletter',
  status public.email_campaign_status NOT NULL DEFAULT 'draft',
  content_html TEXT DEFAULT NULL,
  content_json JSONB DEFAULT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  audience_type TEXT DEFAULT NULL,
  audience_reference TEXT DEFAULT NULL,
  has_unsubscribe_link BOOLEAN DEFAULT true,
  compliance_checked_at TIMESTAMPTZ DEFAULT NULL,
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_complained INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- 5. email_campaign_logs
CREATE TABLE IF NOT EXISTS public.email_campaign_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT DEFAULT NULL,
  recipient_name TEXT DEFAULT NULL,
  sender_email TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending',
  event_type TEXT NOT NULL DEFAULT 'send',
  event_data JSONB DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  is_test BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaign_logs ENABLE ROW LEVEL SECURITY;

-- 6. email_events
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  log_id UUID REFERENCES public.email_campaign_logs(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  link_url TEXT DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- 7. email_suppression_list
CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribed',
  source TEXT DEFAULT NULL,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

-- RLS policies for all 7 tables (tenant-scoped)
CREATE POLICY "Tenant isolation" ON public.cashback_configs FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.generated_coupons FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_templates FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_campaigns FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_campaign_logs FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_events FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_suppression_list FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashback_configs_tenant ON public.cashback_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_coupons_tenant ON public.generated_coupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_coupons_config ON public.generated_coupons(config_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON public.email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON public.email_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_tenant ON public.email_campaign_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_campaign ON public.email_campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_tenant ON public.email_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON public.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_suppression_tenant ON public.email_suppression_list(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_suppression_email ON public.email_suppression_list(tenant_id, email);
