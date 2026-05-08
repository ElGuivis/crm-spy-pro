-- Remover constraint antigo que só permite um registro por tenant
ALTER TABLE tenant_ai_credentials 
DROP CONSTRAINT IF EXISTS tenant_ai_credentials_tenant_id_key;

-- Adicionar constraint correto para permitir múltiplos provedores por tenant
ALTER TABLE tenant_ai_credentials 
ADD CONSTRAINT tenant_ai_credentials_tenant_provider_unique 
UNIQUE (tenant_id, provider);