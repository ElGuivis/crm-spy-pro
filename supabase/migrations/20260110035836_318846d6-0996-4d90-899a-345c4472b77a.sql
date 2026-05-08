-- Create me_auto_sync_configs table for Melhor Envio auto-sync control
CREATE TABLE IF NOT EXISTS public.me_auto_sync_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'shipments',
  is_active BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, sync_type)
);

-- Enable RLS
ALTER TABLE public.me_auto_sync_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role access for edge functions
CREATE POLICY "Service role full access to ME auto-sync configs"
  ON public.me_auto_sync_configs FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_me_auto_sync_configs_updated_at
  BEFORE UPDATE ON public.me_auto_sync_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for cron queries
CREATE INDEX idx_me_auto_sync_next_sync ON public.me_auto_sync_configs(next_sync_at) 
  WHERE is_active = true;