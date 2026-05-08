-- Add verification state columns to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS verification_state TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_data JSONB DEFAULT NULL;

-- Add comment explaining the states
COMMENT ON COLUMN public.conversations.verification_state IS 'Order verification flow state: awaiting_order_number, awaiting_cpf_verification, verified, or NULL';
COMMENT ON COLUMN public.conversations.verification_data IS 'Stores verification context: {order_id, order_number, cpf_prefix, attempts}';