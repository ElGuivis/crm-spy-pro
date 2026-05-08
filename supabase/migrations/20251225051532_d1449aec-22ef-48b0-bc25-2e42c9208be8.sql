-- Create integrations table to store tenant integration configurations
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'loja_integrada', 'nuvemshop', etc.
  api_key TEXT, -- encrypted API key for the integration
  status TEXT NOT NULL DEFAULT 'pending', -- 'connected', 'disconnected', 'pending', 'error'
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- For now, allow public access (since no auth is implemented yet)
-- This should be updated when auth is added
CREATE POLICY "Allow all operations on integrations" 
ON public.integrations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_integrations_type ON public.integrations(type);
CREATE INDEX idx_integrations_status ON public.integrations(status);