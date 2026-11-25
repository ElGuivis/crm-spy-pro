-- Disparo em massa mais seguro contra restrição do número:
-- 1) resposta automática: a 1ª mensagem vai sem link; quem responder recebe `reply_message` (uma vez só)
-- 2) limite diário por número (instância) com aquecimento: daily_limit + daily_limit_step por dia já enviado

ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS reply_message text,
  ADD COLUMN IF NOT EXISTS replied_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_limit integer CHECK (daily_limit IS NULL OR daily_limit > 0),
  ADD COLUMN IF NOT EXISTS daily_limit_step integer NOT NULL DEFAULT 0 CHECK (daily_limit_step >= 0);

ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_status text CHECK (reply_status IN ('sending', 'sent', 'failed', 'declined'));

-- telefone da lista normalizado como o resto do sistema (55 + nono dígito)
CREATE OR REPLACE FUNCTION public.bulk_contact_phone_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT public.br_phone_key(CASE WHEN d !~ '^55' AND length(d) <= 11 THEN '55' || d ELSE d END)
  FROM (SELECT regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') AS d) x
$$;

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_reply_lookup
  ON public.campaign_contacts (tenant_id, public.bulk_contact_phone_key(phone))
  WHERE status = 'sent' AND reply_status IS NULL;

-- Reivindica (atômico) o contato que respondeu a um disparo com resposta automática nos últimos 7 dias.
-- _status: 'sending' (vai mandar a resposta) ou 'declined' (respondeu "não": só registra).
CREATE OR REPLACE FUNCTION public.claim_bulk_reply(_tenant_id uuid, _phone_key text, _status text)
RETURNS TABLE (contact_id uuid, campaign_id uuid, name text, variables jsonb, reply_message text)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF _status NOT IN ('sending', 'declined') THEN RAISE EXCEPTION 'status inválido'; END IF;
  SELECT cc.id, cc.campaign_id, cc.name, cc.variables, bc.reply_message AS msg
    INTO r
    FROM campaign_contacts cc
    JOIN bulk_campaigns bc ON bc.id = cc.campaign_id
   WHERE cc.tenant_id = _tenant_id
     AND public.bulk_contact_phone_key(cc.phone) = _phone_key
     AND cc.status = 'sent' AND cc.reply_status IS NULL
     AND cc.sent_at > now() - interval '7 days'
     AND nullif(btrim(bc.reply_message), '') IS NOT NULL
   ORDER BY cc.sent_at DESC
   LIMIT 1
   FOR UPDATE OF cc SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE campaign_contacts SET reply_status = _status, replied_at = now() WHERE id = r.id;
  UPDATE bulk_campaigns SET replied_count = replied_count + 1 WHERE id = r.campaign_id;
  RETURN QUERY SELECT r.id, r.campaign_id, r.name, r.variables, r.msg;
END $$;

-- Uso do dia: envios de HOJE (Brasília) no mesmo número em todos os disparos + dias anteriores com envio desta campanha.
CREATE OR REPLACE FUNCTION public.get_bulk_daily_usage(_campaign_id uuid)
RETURNS TABLE (sent_today integer, days_before integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH c AS (SELECT whatsapp_integration_id AS wid FROM bulk_campaigns WHERE id = _campaign_id),
  today AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d)
  SELECT
    (SELECT count(*)::int FROM campaign_contacts cc JOIN bulk_campaigns bc ON bc.id = cc.campaign_id, c, today
      WHERE bc.whatsapp_integration_id = c.wid AND cc.status = 'sent'
        AND cc.sent_at >= (today.d::timestamp AT TIME ZONE 'America/Sao_Paulo')),
    (SELECT count(DISTINCT (cc.sent_at AT TIME ZONE 'America/Sao_Paulo')::date)::int FROM campaign_contacts cc, today
      WHERE cc.campaign_id = _campaign_id AND cc.status = 'sent'
        AND cc.sent_at < (today.d::timestamp AT TIME ZONE 'America/Sao_Paulo'))
$$;

REVOKE EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bulk_daily_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bulk_reply(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bulk_daily_usage(uuid) TO service_role;
