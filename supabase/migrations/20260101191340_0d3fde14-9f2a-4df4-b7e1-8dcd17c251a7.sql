-- Remover check constraint antigo
ALTER TABLE tenant_ai_credentials 
DROP CONSTRAINT tenant_ai_credentials_provider_check;

-- Adicionar check constraint atualizado com todos os provedores
ALTER TABLE tenant_ai_credentials 
ADD CONSTRAINT tenant_ai_credentials_provider_check 
CHECK (provider IN ('lovable', 'openai', 'google', 'groq', 'mistral'));