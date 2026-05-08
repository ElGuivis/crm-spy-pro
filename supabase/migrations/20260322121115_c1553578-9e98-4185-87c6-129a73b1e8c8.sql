
-- Backfill migration: formalize columns that exist in production but were missing from migration history
-- These columns are already in the live database (reflected in types.ts) but had no corresponding DDL.

-- ai_agents: verification_type
ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT NULL;

-- email_integrations: sender_name
ALTER TABLE public.email_integrations
ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT NULL;

-- profiles: checklist_dismissed, notification_prefs, onboarding_completed
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS checklist_dismissed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- team_invites: invite_token_hash
ALTER TABLE public.team_invites
ADD COLUMN IF NOT EXISTS invite_token_hash TEXT DEFAULT NULL;

-- tenant_ai_credentials: is_default
ALTER TABLE public.tenant_ai_credentials
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
