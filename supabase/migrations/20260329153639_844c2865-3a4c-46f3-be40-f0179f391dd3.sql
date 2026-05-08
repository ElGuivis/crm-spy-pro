CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_id_unique 
ON public.messages (provider_message_id) 
WHERE provider_message_id IS NOT NULL;