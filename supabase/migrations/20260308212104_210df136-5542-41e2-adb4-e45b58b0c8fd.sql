ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{"enabled":true,"sound":true,"events":{"new_order":true,"new_message":true,"sync_error":true,"low_stock":true,"rfm_alert":true,"campaign_complete":true}}'::jsonb,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS checklist_dismissed boolean DEFAULT false;