-- Add column for WhatsApp integration selection
ALTER TABLE public.cashback_configs 
ADD COLUMN IF NOT EXISTS whatsapp_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;