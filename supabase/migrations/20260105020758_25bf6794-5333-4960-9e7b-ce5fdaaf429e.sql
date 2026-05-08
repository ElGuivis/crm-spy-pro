-- Add tracking_link_base column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS tracking_link_base TEXT;