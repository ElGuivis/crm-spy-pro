
-- Add last_offset column to track pagination position
ALTER TABLE public.li_sync_state ADD COLUMN IF NOT EXISTS last_offset integer DEFAULT 0;

-- Reset orders sync state to start fresh with resumable pagination
UPDATE public.li_sync_state 
SET last_offset = 0, last_cursor = NULL, records_synced = 0
WHERE entity_type = 'orders';
