-- Visual flow builder for WhatsApp chatbots
-- Nodes/edges are stored flat per flow (no versioning for MVP)

CREATE TABLE IF NOT EXISTS chatbot_flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatbot_flow_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     UUID NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  node_type   TEXT NOT NULL CHECK (node_type IN ('start','message','question','condition','action','end')),
  label       TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  position_x  FLOAT NOT NULL DEFAULT 0,
  position_y  FLOAT NOT NULL DEFAULT 0,
  is_entry    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chatbot_flow_edges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        UUID NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES chatbot_flow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES chatbot_flow_nodes(id) ON DELETE CASCADE,
  condition      JSONB,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES chatbot_flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_nodes_flow ON chatbot_flow_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_edges_flow ON chatbot_flow_edges(flow_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_edges_source ON chatbot_flow_edges(source_node_id);

-- RLS
ALTER TABLE chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_flow_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatbot_flows_all"       ON chatbot_flows       USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_nodes_all"  ON chatbot_flow_nodes  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_edges_all"  ON chatbot_flow_edges  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "chatbot_flows_ins"       ON chatbot_flows       FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_nodes_ins"  ON chatbot_flow_nodes  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_edges_ins"  ON chatbot_flow_edges  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "chatbot_flows_upd"       ON chatbot_flows       FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_nodes_upd"  ON chatbot_flow_nodes  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_edges_upd"  ON chatbot_flow_edges  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "chatbot_flows_del"       ON chatbot_flows       FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_nodes_del"  ON chatbot_flow_nodes  FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "chatbot_flow_edges_del"  ON chatbot_flow_edges  FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE OR REPLACE FUNCTION update_chatbot_flows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_chatbot_flows_updated_at
  BEFORE UPDATE ON chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION update_chatbot_flows_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE chatbot_flows, chatbot_flow_nodes, chatbot_flow_edges;
ALTER TABLE chatbot_flows      REPLICA IDENTITY FULL;
ALTER TABLE chatbot_flow_nodes REPLICA IDENTITY FULL;
ALTER TABLE chatbot_flow_edges REPLICA IDENTITY FULL;
