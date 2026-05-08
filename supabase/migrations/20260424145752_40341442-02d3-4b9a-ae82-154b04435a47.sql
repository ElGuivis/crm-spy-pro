ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS next_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_lock_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_status_next_send
  ON public.bulk_campaigns(status, next_send_at)
  WHERE status = 'processing';

-- Atomic helper to try to acquire a processing lock for a campaign.
-- Returns TRUE only when this caller successfully became the owner of the lock.
CREATE OR REPLACE FUNCTION public.try_acquire_bulk_campaign_lock(
  _campaign_id uuid,
  _lock_seconds integer DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acquired boolean;
BEGIN
  UPDATE public.bulk_campaigns
  SET processing_lock_until = now() + make_interval(secs => _lock_seconds)
  WHERE id = _campaign_id
    AND status = 'processing'
    AND (processing_lock_until IS NULL OR processing_lock_until < now())
    AND (next_send_at IS NULL OR next_send_at <= now())
  RETURNING true INTO _acquired;

  RETURN COALESCE(_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bulk_campaign_lock(
  _campaign_id uuid,
  _next_send_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bulk_campaigns
  SET processing_lock_until = NULL,
      next_send_at = now() + make_interval(secs => _next_send_seconds)
  WHERE id = _campaign_id;
END;
$$;