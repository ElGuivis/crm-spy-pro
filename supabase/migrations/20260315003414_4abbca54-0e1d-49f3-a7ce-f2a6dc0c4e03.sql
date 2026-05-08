ALTER TABLE public.email_integrations
  ADD COLUMN IF NOT EXISTS daily_send_limit integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_sends_per_second integer DEFAULT NULL;