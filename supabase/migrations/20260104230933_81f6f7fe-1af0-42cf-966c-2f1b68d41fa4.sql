-- Add verification_type column to ai_agents table
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS 
  verification_type TEXT DEFAULT 'order';

-- Add comment
COMMENT ON COLUMN public.ai_agents.verification_type IS 'Type of verification: order (for orders/CPF) or shipping (for shipments/phone)';