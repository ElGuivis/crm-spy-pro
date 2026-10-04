-- Saude do envio de e-mail marketing (ultimos p_days dias): taxas de falha, descadastro, bounce e reclamacao,
-- mais campanhas que parecem travadas. Bounce e reclamacao so aparecem quando o webhook do provedor (SES) estiver ligado.
CREATE OR REPLACE FUNCTION public.get_email_health(p_tenant_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (
  sent bigint, failed bigint, unsubscribed bigint, bounced bigint, complaints bigint,
  campaigns bigint, stuck_campaigns bigint, last_send_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT id, status, send_lease_until, started_at, sent_at FROM public.email_campaigns
    WHERE public.caller_has_tenant(p_tenant_id) AND tenant_id = p_tenant_id
      AND COALESCE(sent_at, started_at, created_at) >= now() - make_interval(days => GREATEST(p_days, 1))
      AND status IN ('sent', 'sending', 'paused', 'error')
  ),
  q AS (
    SELECT count(*) FILTER (WHERE s.status = 'sent') AS sent, count(*) FILTER (WHERE s.status = 'failed') AS failed
    FROM public.email_send_queue s WHERE s.campaign_id IN (SELECT id FROM c)
  ),
  ev AS (
    SELECT count(DISTINCT lower(e.recipient_email)) FILTER (WHERE e.event_type = 'unsubscribe') AS unsub,
           count(DISTINCT lower(e.recipient_email)) FILTER (WHERE e.event_type = 'bounce') AS bnc,
           count(DISTINCT lower(e.recipient_email)) FILTER (WHERE e.event_type = 'complaint') AS cmp
    FROM public.email_events e WHERE e.campaign_id IN (SELECT id FROM c)
  )
  SELECT q.sent, q.failed, ev.unsub, ev.bnc, ev.cmp,
         (SELECT count(*) FROM c),
         (SELECT count(*) FROM c WHERE status = 'sending' AND (send_lease_until IS NULL OR send_lease_until < now() - interval '10 minutes')
            AND started_at < now() - interval '30 minutes'),
         (SELECT max(COALESCE(sent_at, started_at)) FROM c)
  FROM q, ev;
$$;

REVOKE EXECUTE ON FUNCTION public.get_email_health(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_health(uuid, integer) TO authenticated, service_role;
