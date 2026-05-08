
-- Add source column to conversations to differentiate organic vs automation conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'organic';

-- Add auto-close config for automation conversations
ALTER TABLE public.ai_assistant_configs 
  ADD COLUMN IF NOT EXISTS automation_auto_close_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_auto_close_minutes INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS automation_auto_close_message TEXT DEFAULT 'Como não tivemos mais contato estamos encerrando o seu atendimento, caso precise de alguma ajuda fique a vontade para entrar em contato novamente.';

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_conversations_source ON public.conversations(source);
