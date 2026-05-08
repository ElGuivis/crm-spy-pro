-- Add inactivity configuration fields to ai_assistant_configs
ALTER TABLE public.ai_assistant_configs 
ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inactivity_message text DEFAULT 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!';