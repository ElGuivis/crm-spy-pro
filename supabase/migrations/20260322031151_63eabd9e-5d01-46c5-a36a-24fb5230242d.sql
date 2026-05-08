-- Drop plaintext index
DROP INDEX IF EXISTS idx_team_invites_token;

-- Remove UNIQUE constraint on invite_token (it was created via UNIQUE keyword on column)
ALTER TABLE public.team_invites DROP CONSTRAINT IF EXISTS team_invites_invite_token_key;

-- Clear any remaining plaintext tokens
UPDATE public.team_invites SET invite_token = '' WHERE invite_token != '';

-- Add NOT NULL + UNIQUE to hash column for future integrity
ALTER TABLE public.team_invites ALTER COLUMN invite_token SET DEFAULT '';
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_invite_token_hash_unique UNIQUE (invite_token_hash);