-- Add default_ai_agent_id to ai_assistant_configs
ALTER TABLE public.ai_assistant_configs
ADD COLUMN default_ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;