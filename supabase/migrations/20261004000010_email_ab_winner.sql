-- Teste A/B com vencedor automatico: A e B recebem uma fatia pequena da lista; depois de N horas o assunto com
-- maior taxa de abertura vai para o restante (campanha "W", criada junto, que espera o resultado).
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS ab_auto_winner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_winner_hours integer CHECK (ab_winner_hours IS NULL OR ab_winner_hours BETWEEN 1 AND 72),
  ADD COLUMN IF NOT EXISTS ab_winner_variant text CHECK (ab_winner_variant IS NULL OR ab_winner_variant IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS ab_winner_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_winner_detail jsonb;

-- Testes prontos para decidir: A e B ja enviados ha pelo menos ab_winner_hours horas e o resto (W) ainda esperando.
-- Abertura = pessoas distintas que abriram / enviados. So para as funcoes agendadas (service role).
CREATE OR REPLACE FUNCTION public.get_ab_winner_candidates()
RETURNS TABLE (
  w_id uuid, tenant_id uuid,
  a_id uuid, a_subject text, a_sent integer, a_opens integer, a_clicks integer,
  b_id uuid, b_subject text, b_sent integer, b_opens integer, b_clicks integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.tenant_id,
         a.id, a.subject, COALESCE(a.total_sent, 0),
         (SELECT count(DISTINCT lower(btrim(e.recipient_email)))::int FROM public.email_events e WHERE e.campaign_id = a.id AND e.event_type = 'open'),
         (SELECT count(DISTINCT lower(btrim(e.recipient_email)))::int FROM public.email_events e WHERE e.campaign_id = a.id AND e.event_type = 'click'),
         b.id, b.subject, COALESCE(b.total_sent, 0),
         (SELECT count(DISTINCT lower(btrim(e.recipient_email)))::int FROM public.email_events e WHERE e.campaign_id = b.id AND e.event_type = 'open'),
         (SELECT count(DISTINCT lower(btrim(e.recipient_email)))::int FROM public.email_events e WHERE e.campaign_id = b.id AND e.event_type = 'click')
  FROM public.email_campaigns w
  JOIN public.email_campaigns a ON a.ab_test_id = w.ab_test_id AND a.ab_variant = 'A' AND a.status::text = 'sent'
  JOIN public.email_campaigns b ON b.ab_test_id = w.ab_test_id AND b.ab_variant = 'B' AND b.status::text = 'sent'
  WHERE w.ab_variant = 'W' AND w.ab_auto_winner AND w.status::text = 'draft' AND w.ab_winner_decided_at IS NULL
    AND GREATEST(COALESCE(a.sent_at, a.completed_at), COALESCE(b.sent_at, b.completed_at))
        + make_interval(hours => COALESCE(w.ab_winner_hours, 4)) <= now();
$$;

REVOKE EXECUTE ON FUNCTION public.get_ab_winner_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ab_winner_candidates() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-ab-winner') THEN
    PERFORM cron.schedule('email-ab-winner', '*/10 * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/email-ab-winner',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 60000)
    $job$);
  END IF;
END
$$;
