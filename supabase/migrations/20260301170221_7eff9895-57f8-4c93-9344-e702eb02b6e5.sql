
-- Phase 6: Fix - Create capabilities columns on instagram_channels instead
ALTER TABLE public.instagram_channels 
  ADD COLUMN IF NOT EXISTS supports_follow_to_dm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_share_to_dm BOOLEAN DEFAULT false;
