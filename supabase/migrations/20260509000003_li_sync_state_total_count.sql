-- Add total_count column to li_sync_state so frontend can show progress %.
ALTER TABLE public.li_sync_state
  ADD COLUMN IF NOT EXISTS total_count integer;
