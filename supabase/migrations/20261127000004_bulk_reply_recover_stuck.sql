-- Resposta automática presa em 'sending' (o runtime reiniciou no meio da espera humana: deploy de funções)
-- é reenviada sozinha pela bulk-reply-scheduled após 10 min. Para isso o webhook passa a gravar, já na
-- reivindicação, de onde responder (reply_integration_id/phone/conversation). 27/11/2026: Izabella e Victor
-- responderam "sim" durante deploys e ficaram sem o link.

CREATE OR REPLACE FUNCTION public.claim_scheduled_bulk_replies(_campaign_id uuid, _limit integer)
RETURNS TABLE (contact_id uuid, tenant_id uuid, name text, variables jsonb, reply_message text,
               reply_integration_id uuid, reply_phone text, reply_conversation_id uuid)
LANGUAGE sql SET search_path = public AS $$
  WITH picked AS (
    SELECT cc.id
      FROM campaign_contacts cc
     WHERE cc.campaign_id = _campaign_id
       AND (cc.reply_status = 'scheduled'
            OR (cc.reply_status = 'sending' AND cc.reply_integration_id IS NOT NULL
                AND coalesce(cc.reply_claimed_at, cc.replied_at) < now() - interval '10 minutes'))
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

DROP INDEX IF EXISTS idx_campaign_contacts_reply_scheduled;
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_reply_scheduled
  ON public.campaign_contacts (campaign_id, replied_at)
  WHERE reply_status = 'scheduled' OR (reply_status = 'sending' AND reply_integration_id IS NOT NULL);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bulk-reply-scheduled';
SELECT cron.schedule('bulk-reply-scheduled', '*/2 * * * *', $cron$
  SELECT net.http_post(
    url := public.functions_base_url() || '/functions/v1/bulk-reply-scheduled',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) WHERE EXISTS (SELECT 1 FROM public.campaign_contacts WHERE reply_status = 'scheduled'
                   OR (reply_status = 'sending' AND reply_integration_id IS NOT NULL
                       AND coalesce(reply_claimed_at, replied_at) < now() - interval '10 minutes'));
$cron$);
