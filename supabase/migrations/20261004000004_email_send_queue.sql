-- Fila de envio das campanhas de e-mail: o envio deixa de ser um laço único dentro de uma chamada (que estourava o
-- tempo da função com bases grandes e não retomava) e passa a processar em lotes, com retomada automática.
--   - email_send_queue: um registro por destinatário (pending -> sending -> sent/failed)
--   - claim_email_send_batch: pega o próximo lote sem pegar o mesmo destinatário duas vezes (SKIP LOCKED)
--   - send_lease_until: "trava" de quem está processando a campanha (evita dois processadores ao mesmo tempo)
--   - email_send_watchdog (cron, 1 min): devolve à fila o que ficou preso e reativa campanhas paradas

ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS send_lease_until timestamptz;

CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name  text,
  recipient_phone text,
  sender_email    text,
  sender_name     text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  error_message   text,
  claimed_at      timestamptz,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_email_send_queue_next ON public.email_send_queue (campaign_id, status, id);

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_send_queue FROM anon, authenticated;
GRANT ALL ON public.email_send_queue TO service_role;

-- Próximo lote da fila (só service_role / cron)
CREATE OR REPLACE FUNCTION public.claim_email_send_batch(p_campaign_id uuid, p_limit integer DEFAULT 40)
RETURNS SETOF public.email_send_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_is_trusted() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  UPDATE public.email_send_queue q
     SET status = 'sending', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.id IN (
     SELECT id FROM public.email_send_queue
      WHERE campaign_id = p_campaign_id AND status = 'pending'
      ORDER BY id
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END;
$$;

-- Devolve à fila o que ficou "sending" (o processador morreu no meio); depois de 3 tentativas vira falha
CREATE OR REPLACE FUNCTION public.requeue_stuck_email_sends(p_older_than interval DEFAULT interval '3 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requeued integer;
BEGIN
  IF NOT public.caller_is_trusted() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.email_send_queue
     SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
         error_message = CASE WHEN attempts >= 3 THEN 'Sem resposta do servidor de envio após 3 tentativas' ELSE error_message END,
         processed_at = CASE WHEN attempts >= 3 THEN now() ELSE processed_at END
   WHERE status = 'sending' AND claimed_at < now() - p_older_than;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;
  RETURN v_requeued;
END;
$$;

-- Progresso do envio (para a barra de progresso da tela)
CREATE OR REPLACE FUNCTION public.get_email_campaign_progress(p_tenant_id uuid, p_campaign_id uuid)
RETURNS TABLE (pending bigint, sending bigint, sent bigint, failed bigint, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*) FILTER (WHERE q.status = 'pending'),
         count(*) FILTER (WHERE q.status = 'sending'),
         count(*) FILTER (WHERE q.status = 'sent'),
         count(*) FILTER (WHERE q.status = 'failed'),
         count(*)
  FROM public.email_send_queue q
  WHERE public.caller_has_tenant(p_tenant_id) AND q.tenant_id = p_tenant_id AND q.campaign_id = p_campaign_id;
$$;

-- Cron: reativa campanhas em envio que ficaram sem processador (função caiu, reinício do servidor...)
CREATE OR REPLACE FUNCTION public.email_send_watchdog()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  IF NOT public.caller_is_trusted() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.requeue_stuck_email_sends();
  FOR r IN
    SELECT c.id FROM public.email_campaigns c
     WHERE c.status = 'sending'
       AND (c.send_lease_until IS NULL OR c.send_lease_until < now())
       AND EXISTS (SELECT 1 FROM public.email_send_queue q WHERE q.campaign_id = c.id AND q.status = 'pending')
  LOOP
    PERFORM net.http_post(
      url := public.functions_base_url() || '/functions/v1/email-campaign-send',
      headers := public.get_internal_headers(),
      body := jsonb_build_object('campaign_id', r.id, 'action', 'resume'),
      timeout_milliseconds := 10000
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.claim_email_send_batch(uuid, integer),
  public.requeue_stuck_email_sends(interval),
  public.get_email_campaign_progress(uuid, uuid),
  public.email_send_watchdog()
FROM PUBLIC, anon;
-- as funções internas (fila, watchdog) só o servidor chama; "authenticated" ainda herda EXECUTE por privilégio padrão
REVOKE EXECUTE ON FUNCTION
  public.claim_email_send_batch(uuid, integer),
  public.requeue_stuck_email_sends(interval),
  public.email_send_watchdog()
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_progress(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.claim_email_send_batch(uuid, integer),
  public.requeue_stuck_email_sends(interval),
  public.email_send_watchdog()
TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-send-watchdog') THEN
    PERFORM cron.schedule('email-send-watchdog', '* * * * *', $job$SELECT public.email_send_watchdog()$job$);
  END IF;
END
$$;
