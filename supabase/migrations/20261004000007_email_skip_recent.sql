-- Protecao contra excesso de e-mail: a campanha pode pular quem ja recebeu e-mail do tenant nos ultimos N dias.
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS skip_recent_days integer
  CHECK (skip_recent_days IS NULL OR skip_recent_days BETWEEN 1 AND 90);

-- Quais destes e-mails receberam algum e-mail real (entregue/enviado) nos ultimos p_days dias,
-- sem contar a propria campanha. So para as funcoes de envio (service role).
CREATE OR REPLACE FUNCTION public.get_recent_email_recipients(p_tenant_id uuid, p_emails text[], p_days integer, p_exclude_campaign uuid DEFAULT NULL)
RETURNS TABLE (email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT lower(btrim(l.recipient_email))
  FROM public.email_campaign_logs l
  WHERE l.tenant_id = p_tenant_id
    AND COALESCE(l.is_test, false) = false
    AND l.status IN ('delivered', 'sent')
    AND l.sent_at >= now() - make_interval(days => GREATEST(p_days, 1))
    AND (p_exclude_campaign IS NULL OR l.campaign_id IS DISTINCT FROM p_exclude_campaign)
    AND lower(btrim(l.recipient_email)) = ANY (p_emails);
$$;

REVOKE EXECUTE ON FUNCTION public.get_recent_email_recipients(uuid, text[], integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_email_recipients(uuid, text[], integer, uuid) TO service_role;
