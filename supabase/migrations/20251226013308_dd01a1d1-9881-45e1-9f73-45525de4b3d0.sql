-- Add integration_id column to li_sync_logs table
ALTER TABLE public.li_sync_logs 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_li_sync_logs_integration_id ON public.li_sync_logs(integration_id);

-- Add integration_id to li_sync_jobs as well for consistency
ALTER TABLE public.li_sync_jobs 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

CREATE INDEX idx_li_sync_jobs_integration_id ON public.li_sync_jobs(integration_id);