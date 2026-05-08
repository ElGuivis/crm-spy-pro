ALTER TABLE public.instagram_media_watchlist
  ADD COLUMN IF NOT EXISTS dm_message text,
  ADD COLUMN IF NOT EXISTS keyword_responses jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rule_name text;