-- Create sync jobs table for robust queueing and resumption
CREATE TABLE public.li_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_log_id UUID REFERENCES public.li_sync_logs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'customers', 'products', 'orders'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  current_offset INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for efficient job lookup
CREATE INDEX idx_li_sync_jobs_status ON public.li_sync_jobs(status);
CREATE INDEX idx_li_sync_jobs_sync_log_id ON public.li_sync_jobs(sync_log_id);

-- Enable RLS (public access for edge functions)
ALTER TABLE public.li_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (edge functions use service role key)
CREATE POLICY "Allow all operations on li_sync_jobs" 
ON public.li_sync_jobs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_li_sync_jobs_updated_at
BEFORE UPDATE ON public.li_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();

-- Enable realtime for sync jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_sync_jobs;