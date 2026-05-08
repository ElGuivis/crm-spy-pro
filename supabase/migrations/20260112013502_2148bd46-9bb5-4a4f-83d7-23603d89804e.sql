-- Add resumable sync columns to bling_sync_jobs
ALTER TABLE public.bling_sync_jobs
ADD COLUMN IF NOT EXISTS resume_page integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_pages_per_run integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by text;

-- Create index for efficient job processing queries
CREATE INDEX IF NOT EXISTS idx_bling_sync_jobs_processor 
ON public.bling_sync_jobs (job_type, status, integration_id) 
WHERE status IN ('pending', 'running');

-- Create index for heartbeat monitoring
CREATE INDEX IF NOT EXISTS idx_bling_sync_jobs_heartbeat 
ON public.bling_sync_jobs (last_heartbeat_at) 
WHERE status IN ('pending', 'running');