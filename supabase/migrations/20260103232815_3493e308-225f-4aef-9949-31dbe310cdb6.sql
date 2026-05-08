-- Add frontend_url column to oauth_states table for correct OAuth redirects
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS frontend_url TEXT;