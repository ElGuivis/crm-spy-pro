-- Resposta automática do disparo FORA do horário da campanha (sending_schedule, fuso da campanha = Brasília)
-- não sai na hora: fica 'scheduled' e a função bulk-reply-scheduled envia quando a janela abrir.
-- Motivo (27/11/2026): o WhatsApp entregou respostas da tarde com 7–15 h de atraso (conexão instável do número)
-- e o link saiu às 4 h da manhã.

ALTER TABLE public.campaign_contacts
  DROP CONSTRAINT IF EXISTS campaign_contacts_reply_status_check,
  ADD CONSTRAINT campaign_contacts_reply_status_check
    CHECK (reply_status = ANY (ARRAY['sending','sent','failed','declined','scheduled'])),
  -- de onde responder quando a janela abrir
  ADD COLUMN IF NOT EXISTS reply_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_phone text,
  ADD COLUMN IF NOT EXISTS reply_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  -- quando o envio agendado foi reivindicado (reenvio se o runtime cair: 10 min)
  ADD COLUMN IF NOT EXISTS reply_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_reply_scheduled
  ON public.campaign_contacts (campaign_id, replied_at)
  WHERE reply_status = 'scheduled' OR (reply_status = 'sending' AND reply_claimed_at IS NOT NULL);

-- Reivindica até _limit respostas agendadas de UMA campanha (a janela é conferida no código antes).
-- Também retoma 'sending' agendado preso há mais de 10 min.
CREATE OR REPLACE FUNCTION public.claim_scheduled_bulk_replies(_campaign_id uuid, _limit integer)
RETURNS TABLE (contact_id uuid, tenant_id uuid, name text, variables jsonb, reply_message text,
               reply_integration_id uuid, reply_phone text, reply_conversation_id uuid)
LANGUAGE sql SET search_path = public AS $$
  WITH picked AS (
    SELECT cc.id
      FROM campaign_contacts cc
     WHERE cc.campaign_id = _campaign_id
       AND (cc.reply_status = 'scheduled'
            OR (cc.reply_status = 'sending' AND cc.reply_claimed_at < now() - interval '10 minutes'))
     ORDER BY cc.replied_at
     LIMIT greatest(1, least(_limit, 20))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE campaign_contacts cc
     SET reply_status = 'sending', reply_claimed_at = now()
    FROM picked, bulk_campaigns bc
   WHERE cc.id = picked.id AND bc.id = cc.campaign_id
  RETURNING cc.id, cc.tenant_id, cc.name, cc.variables, bc.reply_message,
            cc.reply_integration_id, cc.reply_phone, cc.reply_conversation_id
$$;

REVOKE EXECUTE ON FUNCTION public.claim_scheduled_bulk_replies(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_bulk_replies(uuid, integer) TO service_role;

-- Cron: a cada 2 min envia as agendadas das campanhas que estão dentro do horário.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bulk-reply-scheduled';
SELECT cron.schedule('bulk-reply-scheduled', '*/2 * * * *', $cron$
  SELECT net.http_post(
    url := public.functions_base_url() || '/functions/v1/bulk-reply-scheduled',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) WHERE EXISTS (SELECT 1 FROM public.campaign_contacts WHERE reply_status = 'scheduled'
                   OR (reply_status = 'sending' AND reply_claimed_at < now() - interval '10 minutes'));
$cron$);
