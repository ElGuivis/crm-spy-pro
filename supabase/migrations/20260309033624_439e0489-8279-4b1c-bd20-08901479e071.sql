CREATE OR REPLACE FUNCTION public.increment_campaign_unsubscribed(_campaign_id uuid, _tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.email_campaigns
  SET total_unsubscribed = COALESCE(total_unsubscribed, 0) + 1
  WHERE id = _campaign_id AND tenant_id = _tenant_id;
$$;