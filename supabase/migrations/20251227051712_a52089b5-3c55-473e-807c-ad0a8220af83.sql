-- Add email configuration fields to cashback_configs
ALTER TABLE public.cashback_configs
ADD COLUMN IF NOT EXISTS send_via_email boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_integration_id uuid REFERENCES public.email_integrations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS email_subject text,
ADD COLUMN IF NOT EXISTS email_body_text text,
ADD COLUMN IF NOT EXISTS email_body_html text;