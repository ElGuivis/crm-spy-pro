-- Wire chatbot flow-runner ao whatsapp-webhook.
-- Adiciona trigger_keywords em chatbot_flows e cria tabela de sessões ativas por conversa.

ALTER TABLE chatbot_flows
  ADD COLUMN IF NOT EXISTS trigger_keywords text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS chatbot_flow_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  flow_id         uuid NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
  session         jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  started_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_conv
  ON chatbot_flow_sessions(conversation_id);

-- Apenas uma sessão ativa por conversa (evita race entre flows concorrentes)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_chatbot_flow_sessions_active
  ON chatbot_flow_sessions(conversation_id) WHERE is_active = true;

ALTER TABLE chatbot_flow_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_select" ON chatbot_flow_sessions;
CREATE POLICY "tenant_isolation_select" ON chatbot_flow_sessions
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_insert" ON chatbot_flow_sessions;
CREATE POLICY "tenant_isolation_insert" ON chatbot_flow_sessions
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_update" ON chatbot_flow_sessions;
CREATE POLICY "tenant_isolation_update" ON chatbot_flow_sessions
  FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_delete" ON chatbot_flow_sessions;
CREATE POLICY "tenant_isolation_delete" ON chatbot_flow_sessions
  FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));
