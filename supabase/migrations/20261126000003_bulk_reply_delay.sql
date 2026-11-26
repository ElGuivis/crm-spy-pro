-- Resposta automática do disparo com espera humana: sorteia entre reply_delay_min/max segundos
-- (marca como lida, "digitando..." e envia). Teto de 120 s: a espera roda dentro do webhook (waitUntil, ~150 s).
ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS reply_delay_min_seconds integer NOT NULL DEFAULT 30
    CHECK (reply_delay_min_seconds BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS reply_delay_max_seconds integer NOT NULL DEFAULT 90
    CHECK (reply_delay_max_seconds BETWEEN 0 AND 120);

-- Devolve também a espera; e uma reserva 'sending' presa há mais de 10 min (runtime reiniciado no meio da espera)
-- pode ser reivindicada de novo quando a pessoa escrever outra vez.
DROP FUNCTION IF EXISTS public.claim_bulk_reply(uuid, text, text);
CREATE FUNCTION public.claim_bulk_reply(_tenant_id uuid, _phone_key text, _status text)
RETURNS TABLE (contact_id uuid, campaign_id uuid, name text, variables jsonb, reply_message text,
               delay_min integer, delay_max integer)
LANGUAGE plpgsql SET search_path = public AS $$
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
     AND cc.sent_at > now() - interval '7 days'
     AND nullif(btrim(bc.reply_message), '') IS NOT NULL
   ORDER BY cc.sent_at DESC
   LIMIT 1
   FOR UPDATE OF cc SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE campaign_contacts SET reply_status = _status, replied_at = now() WHERE id = r.id;
  IF r.fresh THEN UPDATE bulk_campaigns SET replied_count = replied_count + 1 WHERE id = r.campaign_id; END IF;
  RETURN QUERY SELECT r.id, r.campaign_id, r.name, r.variables, r.msg, r.dmin, r.dmax;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text) TO service_role;

-- índice da busca acompanha o novo filtro (inclui 'sending' presos)
DROP INDEX IF EXISTS public.idx_campaign_contacts_reply_lookup;
CREATE INDEX idx_campaign_contacts_reply_lookup
  ON public.campaign_contacts (tenant_id, public.bulk_contact_phone_key(phone))
  WHERE status = 'sent' AND (reply_status IS NULL OR reply_status = 'sending');
