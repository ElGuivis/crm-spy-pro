-- Add keyword_action_rules column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS keyword_action_rules JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.ai_agents.keyword_action_rules IS 'Rules for automatic actions triggered by keywords without AI processing';