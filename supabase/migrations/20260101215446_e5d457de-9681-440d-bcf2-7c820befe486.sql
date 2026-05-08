-- Add inactivity configuration columns to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS inactivity_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inactivity_target_column_id UUID DEFAULT NULL REFERENCES kanban_columns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS inactivity_message TEXT DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!';