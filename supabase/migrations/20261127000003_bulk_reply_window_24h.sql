-- Resposta automática do disparo só vale para quem responde ao MESMO número que enviou e em até 24 h.
-- Antes: qualquer mensagem em 7 dias, para qualquer número da loja, ganhava o link (27/11/2026: Murilo recebeu
-- o disparo em 25/11 — texto que já tinha o link — e 2 dias depois, conversando de outra coisa, recebeu o link de novo).
-- _integration_id NULL (chamada antiga) mantém só a janela de 24 h.

DROP FUNCTION IF EXISTS public.claim_bulk_reply(uuid, text, text);

CREATE OR REPLACE FUNCTION public.claim_bulk_reply(_tenant_id uuid, _phone_key text, _status text, _integration_id uuid DEFAULT NULL)
RETURNS TABLE (contact_id uuid, campaign_id uuid, name text, variables jsonb, reply_message text, delay_min integer, delay_max integer)
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE r record;
BEGIN
  IF _status NOT IN ('sending', 'declined') THEN RAISE EXCEPTION 'status inválido'; END IF;
  SELECT cc.id, cc.campaign_id, cc.name, cc.variables, bc.reply_message AS msg,
         bc.reply_delay_min_seconds AS dmin, bc.reply_delay_max_seconds AS dmax,
         (cc.reply_status IS NULL) AS fresh
    INTO r
    FROM campaign_contacts cc
    JOIN bulk_campaigns bc ON bc.id = cc.campaign_id
   WHERE cc.tenant_id = _tenant_id
     AND public.bulk_contact_phone_key(cc.phone) = _phone_key
     AND cc.status = 'sent'
     AND (cc.reply_status IS NULL OR (cc.reply_status = 'sending' AND cc.replied_at < now() - interval '10 minutes'))
     AND cc.sent_at > now() - interval '24 hours'
     AND (_integration_id IS NULL OR cc.sent_integration_id = _integration_id)
     AND nullif(btrim(bc.reply_message), '') IS NOT NULL
   ORDER BY cc.sent_at DESC
   LIMIT 1
   FOR UPDATE OF cc SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE campaign_contacts SET reply_status = _status, replied_at = now() WHERE id = r.id;
  IF r.fresh THEN UPDATE bulk_campaigns SET replied_count = replied_count + 1 WHERE id = r.campaign_id; END IF;
  RETURN QUERY SELECT r.id, r.campaign_id, r.name, r.variables, r.msg, r.dmin, r.dmax;
END $function$;

REVOKE EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text, uuid) TO service_role;
