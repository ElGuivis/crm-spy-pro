-- Add last_status_check_at column for status rotation logic in li-job-processor
ALTER TABLE public.li_orders ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMP WITH TIME ZONE;