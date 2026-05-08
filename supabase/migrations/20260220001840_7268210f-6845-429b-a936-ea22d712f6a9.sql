-- Add agent_type column to distinguish chatbot (structured flow) from ai_agent (generative AI)
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'chatbot';

-- Update any existing records that look like AI agents (have system_prompt but no interactive_buttons)
-- to be classified correctly. Since we can't reliably auto-detect, keep all as 'chatbot' by default
-- and let users create new ai_agents from scratch.

-- Add an index for faster filtering
CREATE INDEX IF NOT EXISTS idx_ai_agents_agent_type ON public.ai_agents (tenant_id, agent_type);

-- Add comment for clarity
COMMENT ON COLUMN public.ai_agents.agent_type IS 'chatbot = structured flow with menus/buttons; ai_agent = generative AI with system prompt training';