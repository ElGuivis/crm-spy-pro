-- Add integration_id column to me_shipments for multi-account support
ALTER TABLE public.me_shipments 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_me_shipments_integration_id ON public.me_shipments(integration_id);