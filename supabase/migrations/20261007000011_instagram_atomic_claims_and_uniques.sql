-- Instagram: mesma familia de falhas do WhatsApp (auditoria de atendimento, 07/10/2026).
-- 1) O despachante do outbox e o worker de webhooks liam os itens e so depois marcavam "sending"/"processing":
--    ciclos sobrepostos (cron de 30 s/1 min + disparo imediato) enviavam duas DMs ou processavam o mesmo evento duas vezes.
--    Agora a reivindicacao e uma instrucao (FOR UPDATE SKIP LOCKED) e item preso por mais de 10 min volta para a fila.
-- 2) instagram_messages e instagram_threads nao tinham unicidade: a checagem "ja existe?" era select + insert (corrida) e
--    os gatilhos de resposta automatica disparavam ANTES dessa checagem, entao o reenvio de um evento respondia de novo.
--    As tabelas estao vazias hoje; o codigo trata o 23505 e so dispara gatilhos para mensagem nova.

ALTER TABLE public.instagram_outbox ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.instagram_webhook_deliveries ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS ux_instagram_messages_provider_message_id
  ON public.instagram_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_instagram_threads_channel_contact
  ON public.instagram_threads (channel_id, contact_id);

CREATE OR REPLACE FUNCTION public.claim_instagram_outbox(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.instagram_outbox q
     SET status = 'sending', locked_at = now()
   WHERE q.id IN (
     SELECT o.id FROM public.instagram_outbox o
      WHERE ((o.status IN ('pending', 'retry', 'queued')) AND o.send_after <= now() AND o.attempt_count < 5)
         OR (o.status = 'sending' AND o.locked_at < now() - interval '10 minutes')
      ORDER BY o.created_at
      LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id;
$$;

CREATE OR REPLACE FUNCTION public.claim_instagram_deliveries(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.instagram_webhook_deliveries d
     SET parse_status = 'processing', locked_at = now()
   WHERE d.id IN (
     SELECT x.id FROM public.instagram_webhook_deliveries x
      WHERE x.processed = false AND x.signature_valid
        AND (x.parse_status = 'pending' OR (x.parse_status = 'processing' AND x.locked_at < now() - interval '10 minutes'))
      ORDER BY x.created_at
      LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      FOR UPDATE SKIP LOCKED)
  RETURNING d.id;
$$;

REVOKE ALL ON FUNCTION public.claim_instagram_outbox(integer), public.claim_instagram_deliveries(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_instagram_outbox(integer), public.claim_instagram_deliveries(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
