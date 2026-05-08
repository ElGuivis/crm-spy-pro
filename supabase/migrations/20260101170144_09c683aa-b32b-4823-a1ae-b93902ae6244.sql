-- Add agent transfer rules to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN agent_transfer_rules jsonb DEFAULT '[]'::jsonb;

-- Add current AI agent tracking to conversations
ALTER TABLE conversations 
ADD COLUMN current_ai_agent_id uuid REFERENCES ai_agents(id);

-- Add comment for documentation
COMMENT ON COLUMN ai_agents.agent_transfer_rules IS 'Array of transfer rules: [{target_agent_id, keywords[], description}]';
COMMENT ON COLUMN conversations.current_ai_agent_id IS 'Currently active AI agent for this conversation (set by transfers)';