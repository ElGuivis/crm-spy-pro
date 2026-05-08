
-- Add max_cycles to reactivation_configs (0 = unlimited)
ALTER TABLE public.reactivation_configs ADD COLUMN IF NOT EXISTS max_cycles integer NOT NULL DEFAULT 0;

-- Create reactivation_cycle_steps table
CREATE TABLE public.reactivation_cycle_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.reactivation_configs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_number integer NOT NULL DEFAULT 1,
  delay_days integer NOT NULL DEFAULT 7,
  message_template text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(config_id, step_number)
);

-- Enable RLS
ALTER TABLE public.reactivation_cycle_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant members can view cycle steps"
  ON public.reactivation_cycle_steps FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert cycle steps"
  ON public.reactivation_cycle_steps FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update cycle steps"
  ON public.reactivation_cycle_steps FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete cycle steps"
  ON public.reactivation_cycle_steps FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Add cycle_step to reactivation_executions to track which step was sent
ALTER TABLE public.reactivation_executions ADD COLUMN IF NOT EXISTS cycle_step integer DEFAULT 1;

-- Index for performance
CREATE INDEX idx_reactivation_cycle_steps_config ON public.reactivation_cycle_steps(config_id, step_number);
