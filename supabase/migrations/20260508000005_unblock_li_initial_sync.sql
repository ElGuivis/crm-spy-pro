-- Unblock integrations stuck with initial_sync_completed = false.
-- Safe to run: only updates LI integrations that already have sync state
-- (meaning data was actually synced, just the flag was never set due to timeout).

UPDATE public.integrations
SET
  initial_sync_completed = true,
  updated_at             = NOW()
WHERE type = 'loja_integrada'
  AND initial_sync_completed = false
  AND EXISTS (
    SELECT 1 FROM public.li_sync_state
    WHERE li_sync_state.integration_id = integrations.id
  );
