-- Add message buffer fields to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS message_buffer_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS message_buffer_delay_seconds integer DEFAULT 10;

-- Add buffer tracking fields to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS pending_ai_response_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS buffered_message_ids uuid[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.ai_agents.message_buffer_enabled IS 'Whether the agent should wait to accumulate multiple messages before responding';
COMMENT ON COLUMN public.ai_agents.message_buffer_delay_seconds IS 'Seconds to wait after last message before processing buffered messages';
COMMENT ON COLUMN public.conversations.pending_ai_response_at IS 'Timestamp when buffered messages should be processed by AI';
COMMENT ON COLUMN public.conversations.buffered_message_ids IS 'Array of message IDs waiting to be processed together';

-- Create index for efficient buffer processing queries
CREATE INDEX IF NOT EXISTS idx_conversations_pending_ai_response 
ON public.conversations (pending_ai_response_at) 
WHERE pending_ai_response_at IS NOT NULL;