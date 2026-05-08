-- Add interactive_buttons column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS interactive_buttons jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN public.ai_agents.interactive_buttons IS 'Array of interactive buttons: [{id, display_text, action_type, target_agent_id, response_message}]';