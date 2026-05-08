-- Adicionar coluna bling_company_id na tabela bling_connections para mapeamento tenant
ALTER TABLE bling_connections 
ADD COLUMN IF NOT EXISTS bling_company_id TEXT;

-- Criar index para busca rápida por company_id
CREATE INDEX IF NOT EXISTS idx_bling_connections_company_id 
ON bling_connections(bling_company_id);

-- Criar tabela para eventos de webhook (idempotência)
CREATE TABLE bling_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  status TEXT DEFAULT 'received',
  error TEXT NULL
);

-- RLS: apenas service role acessa (sem policies = nenhum client acessa)
ALTER TABLE bling_webhook_events ENABLE ROW LEVEL SECURITY;

-- Index para consultas por status e tenant
CREATE INDEX idx_bling_webhook_events_status ON bling_webhook_events(status);
CREATE INDEX idx_bling_webhook_events_tenant ON bling_webhook_events(tenant_id);
CREATE INDEX idx_bling_webhook_events_received ON bling_webhook_events(received_at DESC);