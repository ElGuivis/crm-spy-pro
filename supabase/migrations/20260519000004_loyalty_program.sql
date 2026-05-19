-- ============================================================
-- Programa de Fidelidade / Pontos
-- ============================================================

-- Config por tenant+integration (uma por integração)
CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Programa de Pontos',
  points_per_brl NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  min_points_redeem INTEGER NOT NULL DEFAULT 100,
  points_to_brl NUMERIC(10,4) NOT NULL DEFAULT 0.01,
  champion_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id)
);

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_programs_tenant" ON public.loyalty_programs
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "loyalty_programs_tenant_insert" ON public.loyalty_programs
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "loyalty_programs_tenant_update" ON public.loyalty_programs
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Ledger de pontos por cliente (crédito/débito)
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  customer_external_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'bonus', 'expire')),
  description TEXT,
  order_id TEXT,
  coupon_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_points_tenant" ON public.loyalty_points
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "loyalty_points_tenant_insert" ON public.loyalty_points
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer
  ON public.loyalty_points(integration_id, customer_external_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_points_order
  ON public.loyalty_points(integration_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_points_tenant
  ON public.loyalty_points(tenant_id, integration_id);
