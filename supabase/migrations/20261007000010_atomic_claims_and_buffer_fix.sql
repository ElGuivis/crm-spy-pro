-- Atendimento: reivindicacao atomica das filas (sem envio duplicado) e conserto do buffer de mensagens da IA.
--
-- 1) outbound_queue / message_queue: o processador lia os itens e so depois marcava "processing" (dois ciclos do
--    cron sobrepostos enviavam a mesma mensagem duas vezes; message_queue ate relia os "processing" de proposito).
--    Agora a reivindicacao e uma unica instrucao com FOR UPDATE SKIP LOCKED, e item preso em "processing" por mais
--    de 10 min (queda do runtime) volta para a fila em vez de ficar perdido para sempre.
-- 2) add_message_to_buffer recebia o id como text e comparava com a coluna uuid[]: dava erro em toda chamada, entao
--    ligar "juntar mensagens" no agente fazia a IA parar de responder. Reescrita com uuid.
-- 3) claim_ai_buffer le e zera o buffer de forma atomica (antes: ler, depois limpar; mensagem que chegava no meio
--    era apagada sem resposta e dois processadores respondiam duas vezes).

ALTER TABLE public.outbound_queue ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_outbound_queue(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.outbound_queue q
     SET status = 'processing', locked_at = now()
   WHERE q.id IN (
     SELECT o.id FROM public.outbound_queue o
      WHERE (o.status IN ('pending', 'failed') AND o.next_retry_at <= now())
         OR (o.status = 'processing' AND o.locked_at < now() - interval '10 minutes')
      ORDER BY o.created_at
      LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id;
$$;

CREATE OR REPLACE FUNCTION public.claim_message_queue(p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.message_queue q
     SET status = 'processing'
   WHERE q.id IN (
     SELECT m.id FROM public.message_queue m
      WHERE (m.status = 'pending' AND m.next_retry_at <= now())
         OR (m.status = 'processing' AND m.updated_at < now() - interval '10 minutes')
      ORDER BY m.next_retry_at
      LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id;
$$;

DROP FUNCTION IF EXISTS public.add_message_to_buffer(uuid, text, integer);
CREATE OR REPLACE FUNCTION public.add_message_to_buffer(_conversation_id uuid, _message_id uuid, _delay_seconds integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET buffered_message_ids = array_append(coalesce(buffered_message_ids, ARRAY[]::uuid[]), _message_id),
         pending_ai_response_at = coalesce(pending_ai_response_at, now() + make_interval(secs => _delay_seconds)),
         updated_at = now()
   WHERE id = _conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_buffer(p_conversation uuid DEFAULT NULL)
RETURNS TABLE (conversation_id uuid, message_ids uuid[])
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  WITH c AS (
    SELECT cv.id, cv.buffered_message_ids AS ids
      FROM public.conversations cv
     WHERE cv.pending_ai_response_at IS NOT NULL AND cv.pending_ai_response_at <= now()
       AND cardinality(coalesce(cv.buffered_message_ids, ARRAY[]::uuid[])) > 0
       AND cv.status = 'bot' AND cv.ai_enabled
       AND (p_conversation IS NULL OR cv.id = p_conversation)
     FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE public.conversations x
       SET pending_ai_response_at = NULL, buffered_message_ids = ARRAY[]::uuid[]
      FROM c WHERE x.id = c.id
    RETURNING x.id
  )
  SELECT c.id, c.ids FROM c JOIN u ON u.id = c.id;
$$;

REVOKE ALL ON FUNCTION public.claim_outbound_queue(integer), public.claim_message_queue(integer), public.claim_ai_buffer(uuid),
  public.add_message_to_buffer(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_queue(integer), public.claim_message_queue(integer), public.claim_ai_buffer(uuid),
  public.add_message_to_buffer(uuid, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 4) send-message idempotente: o painel manda um client_message_id por clique; reenvio/duplo clique/retry de rede
--    com o mesmo id nao gera segunda mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_client_message_id
  ON public.messages (conversation_id, (metadata ->> 'client_message_id'))
  WHERE metadata ->> 'client_message_id' IS NOT NULL;
