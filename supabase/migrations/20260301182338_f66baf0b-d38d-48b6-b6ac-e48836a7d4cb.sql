
-- BUG 1: Fix outbox default from 'queued' to 'pending' (code always uses 'pending')
ALTER TABLE public.instagram_outbox 
  ALTER COLUMN status SET DEFAULT 'pending'::instagram_outbox_status;

-- BUG 2: Drop broken RLS policy on webhook_deliveries (qual=false is semantically wrong; service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role manages webhook deliveries" ON public.instagram_webhook_deliveries;
