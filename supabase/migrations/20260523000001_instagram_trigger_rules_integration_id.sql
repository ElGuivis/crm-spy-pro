-- Fix #3: adicionar instagram_integration_id explícito em instagram_trigger_rules
-- Permite filtrar regras por canal sem JOIN via instagram_flows
ALTER TABLE public.instagram_trigger_rules
  ADD COLUMN IF NOT EXISTS instagram_integration_id uuid
    REFERENCES public.integrations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_instagram_trigger_rules_integration_id
  ON public.instagram_trigger_rules(instagram_integration_id);
