-- Disparo em massa com VÁRIOS números: a campanha guarda a lista (whatsapp_integration_ids) e o processador
-- reveza entre eles. Cada contato enviado guarda o número que enviou (sent_integration_id), e o limite diário
-- passa a valer POR NÚMERO. whatsapp_integration_id segue = 1º número da lista (compatibilidade).

ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS whatsapp_integration_ids uuid[],
  -- último número tentado (base do revezamento; o próximo envio começa no seguinte)
  ADD COLUMN IF NOT EXISTS last_integration_id uuid;

UPDATE public.bulk_campaigns
   SET whatsapp_integration_ids = ARRAY[whatsapp_integration_id]
 WHERE whatsapp_integration_ids IS NULL AND whatsapp_integration_id IS NOT NULL;

ALTER TABLE public.campaign_contacts
  ADD COLUMN IF NOT EXISTS sent_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;

-- contatos antigos: o número era o único da campanha
UPDATE public.campaign_contacts cc
   SET sent_integration_id = bc.whatsapp_integration_id
  FROM public.bulk_campaigns bc
 WHERE bc.id = cc.campaign_id AND cc.status = 'sent' AND cc.sent_integration_id IS NULL
   AND bc.whatsapp_integration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_sent_by_number
  ON public.campaign_contacts (sent_integration_id, sent_at)
  WHERE status = 'sent';

-- Uso do dia de UM número: envios de hoje (Brasília) por ele em todos os disparos
-- + dias anteriores com envio desta campanha (aquecimento).
CREATE OR REPLACE FUNCTION public.get_bulk_daily_usage(_campaign_id uuid, _integration_id uuid)
RETURNS TABLE (sent_today integer, days_before integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH today AS (SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t0)
  SELECT
    (SELECT count(*)::int FROM campaign_contacts cc, today
      WHERE cc.sent_integration_id = _integration_id AND cc.status = 'sent' AND cc.sent_at >= today.t0),
    (SELECT count(DISTINCT (cc.sent_at AT TIME ZONE 'America/Sao_Paulo')::date)::int FROM campaign_contacts cc, today
      WHERE cc.campaign_id = _campaign_id AND cc.status = 'sent' AND cc.sent_at < today.t0)
$$;

REVOKE EXECUTE ON FUNCTION public.get_bulk_daily_usage(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bulk_daily_usage(uuid, uuid) TO service_role;
