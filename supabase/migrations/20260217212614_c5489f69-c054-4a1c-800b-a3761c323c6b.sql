
-- Add ai_agent_id column to inboxes table
ALTER TABLE public.inboxes ADD COLUMN ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_inboxes_ai_agent_id ON public.inboxes(ai_agent_id);
