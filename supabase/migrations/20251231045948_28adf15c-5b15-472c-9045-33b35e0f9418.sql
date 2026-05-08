-- Create table for AI usage tracking
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable',
  model TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view their own AI usage logs"
ON public.ai_usage_logs
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI usage logs"
ON public.ai_usage_logs
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Index for fast queries
CREATE INDEX idx_ai_usage_logs_tenant_created ON public.ai_usage_logs(tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs(tenant_id, provider);

-- Add comment
COMMENT ON TABLE public.ai_usage_logs IS 'Tracks AI API usage per tenant for billing and analytics';