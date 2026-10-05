-- O fluxo de recuperacao so atende abandonos que acontecem DEPOIS de ligado (nunca dispara para historico antigo).
ALTER TABLE public.abandonment_flows ADD COLUMN IF NOT EXISTS enabled_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_abandonment_flow_enabled_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND (TG_OP = 'INSERT' OR NOT OLD.enabled) THEN
    NEW.enabled_at := now();
  ELSIF NOT NEW.enabled THEN
    NEW.enabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abandonment_flow_enabled_at ON public.abandonment_flows;
CREATE TRIGGER trg_abandonment_flow_enabled_at BEFORE INSERT OR UPDATE OF enabled ON public.abandonment_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_abandonment_flow_enabled_at();

-- Quando a pessoa foi retirada da automacao nativa da loja (opt-out), para nao repetir a chamada.
ALTER TABLE public.li_abandonment_campaigns ADD COLUMN IF NOT EXISTS native_optout_at timestamptz;
