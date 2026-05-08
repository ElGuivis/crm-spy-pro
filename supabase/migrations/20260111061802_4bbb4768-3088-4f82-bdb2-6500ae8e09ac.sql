-- Adicionar campo para armazenar ID da última mensagem recebida (para reply em contatos LID)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_incoming_message_id TEXT;

COMMENT ON COLUMN public.conversations.last_incoming_message_id IS 'ID da última mensagem recebida do cliente, usado para reply em contatos @lid';