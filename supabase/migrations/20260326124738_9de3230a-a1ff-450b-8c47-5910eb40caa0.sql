ALTER TABLE public.ai_assistant_configs 
ADD COLUMN IF NOT EXISTS auto_close_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_close_minutes integer NOT NULL DEFAULT 120,
ADD COLUMN IF NOT EXISTS auto_close_message text NOT NULL DEFAULT 'Como não tivemos mais contato, estamos encerrando o seu atendimento. Caso precise de alguma ajuda, fique à vontade para entrar em contato novamente!';