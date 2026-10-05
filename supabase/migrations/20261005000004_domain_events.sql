-- Evento unico de pedido (Fase N4): um pedido novo ou com status alterado gera UM evento 'order_ingested', qualquer que seja o caminho
-- de entrada (sincronizacao, checagem de status, webhook, reconciliacao). Os consumidores (cashback, recuperacao, atribuicao) reagem ao
-- evento, em vez de cada ponto de entrada duplicar a logica. Entrega idempotente por (evento, consumidor).
CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  -- id do registro de origem (li_orders.id)
  ref_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS idx_domain_events_pending ON public.domain_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_domain_events_ref ON public.domain_events (tenant_id, ref_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.domain_event_deliveries (
  event_id uuid NOT NULL REFERENCES public.domain_events(id) ON DELETE CASCADE,
  consumer text NOT NULL,
  -- done | skipped
  status text NOT NULL DEFAULT 'done',
  detail text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer)
);

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_event_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant select" ON public.domain_events;
CREATE POLICY "Tenant select" ON public.domain_events FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.domain_event_deliveries;
CREATE POLICY "Tenant select" ON public.domain_event_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.domain_events e WHERE e.id = event_id AND e.tenant_id = public.get_user_tenant_id(auth.uid())));

-- Gatilho: pedido novo, ou status que mudou. Atualizacoes sem mudanca de status (a sincronizacao regrava o pedido) nao geram evento.
CREATE OR REPLACE FUNCTION public.emit_order_ingested()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status_name IS NOT DISTINCT FROM OLD.status_name THEN RETURN NEW; END IF;
  INSERT INTO public.domain_events (tenant_id, event_type, ref_id, payload)
  VALUES (NEW.tenant_id, 'order_ingested', NEW.id, jsonb_build_object(
    'order_number', NEW.order_number, 'status_name', NEW.status_name,
    'prev_status_name', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status_name ELSE NULL END,
    'is_new', TG_OP = 'INSERT', 'integration_id', NEW.integration_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_emit_order_ingested ON public.li_orders;
CREATE TRIGGER trg_emit_order_ingested AFTER INSERT OR UPDATE ON public.li_orders FOR EACH ROW EXECUTE FUNCTION public.emit_order_ingested();

-- Reserva um lote de eventos pendentes (varias instancias nunca pegam o mesmo; a reserva vence em 2 min)
CREATE OR REPLACE FUNCTION public.claim_domain_events(p_limit integer DEFAULT 50)
RETURNS SETOF public.domain_events LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id FROM public.domain_events e
    WHERE e.processed_at IS NULL AND (e.locked_until IS NULL OR e.locked_until < now())
    ORDER BY e.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.domain_events d SET locked_until = now() + interval '2 minutes', attempts = d.attempts + 1
  FROM picked WHERE d.id = picked.id
  RETURNING d.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_domain_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_domain_events(integer) TO service_role;

-- Retencao: eventos tratados ha mais de 30 dias saem (entregas saem junto, em cascata)
CREATE OR REPLACE FUNCTION public.cleanup_domain_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.domain_events WHERE processed_at IS NOT NULL AND processed_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_domain_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_domain_events() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'domain-event-processor') THEN
    PERFORM cron.schedule('domain-event-processor', '* * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/domain-event-processor',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END $$;
