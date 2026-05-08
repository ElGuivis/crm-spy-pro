-- Add cursor_data column to me_sync_jobs for date-windowing pagination
ALTER TABLE public.me_sync_jobs 
ADD COLUMN IF NOT EXISTS cursor_data jsonb DEFAULT '{}'::jsonb;