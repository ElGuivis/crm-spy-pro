-- Create message queue table for retry system
CREATE TABLE public.message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  message_content TEXT NOT NULL,
  subject TEXT,
  html_content TEXT,
  whatsapp_integration_id UUID,
  email_integration_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage message_queue"
ON public.message_queue FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Tenant members can view their message queue"
ON public.message_queue FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Index for processor query
CREATE INDEX idx_message_queue_pending ON public.message_queue (status, next_retry_at) 
WHERE status IN ('pending', 'processing');

-- Index for tenant queries
CREATE INDEX idx_message_queue_tenant ON public.message_queue (tenant_id, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_message_queue_updated_at
BEFORE UPDATE ON public.message_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();