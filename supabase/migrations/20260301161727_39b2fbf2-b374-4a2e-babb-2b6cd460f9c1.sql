
-- Phase 2: Instagram Automation Base

-- 1. Tags
CREATE TABLE public.instagram_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, channel_id, name)
);

CREATE TABLE public.instagram_contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.instagram_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

-- 2. Flows
CREATE TABLE public.instagram_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  live_version_id uuid,
  allow_parallel_runs boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  snapshot jsonb,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id, version_number)
);

ALTER TABLE public.instagram_flows
  ADD CONSTRAINT instagram_flows_live_version_id_fkey
  FOREIGN KEY (live_version_id) REFERENCES public.instagram_flow_versions(id);

-- 3. Nodes & Edges
CREATE TABLE public.instagram_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  label text,
  config jsonb NOT NULL DEFAULT '{}',
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  is_entry boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE,
  source_handle text,
  label text,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Runs & Steps
CREATE TABLE public.instagram_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id),
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id),
  thread_id uuid NOT NULL REFERENCES public.instagram_threads(id),
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id),
  trigger_rule_id uuid,
  status text NOT NULL DEFAULT 'running',
  current_node_id uuid,
  context jsonb NOT NULL DEFAULT '{}',
  error_message text,
  paused_by_contact_rule boolean NOT NULL DEFAULT false,
  idempotency_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

CREATE TABLE public.instagram_flow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.instagram_flow_runs(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Trigger Rules
CREATE TABLE public.instagram_trigger_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  environment text NOT NULL DEFAULT 'production',
  throttle_mode text NOT NULL DEFAULT 'always',
  keywords text[],
  keyword_match_mode text DEFAULT 'exact',
  tag_filter_ids uuid[],
  time_filter jsonb,
  timeout_seconds integer,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Contact Pauses
CREATE TABLE public.instagram_contact_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  paused_until timestamptz,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  paused_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Add fields to instagram_threads
ALTER TABLE public.instagram_threads
  ADD COLUMN IF NOT EXISTS automations_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS automation_pause_reason text,
  ADD COLUMN IF NOT EXISTS automation_pause_source text;

-- 8. Indexes
CREATE INDEX idx_ig_tags_tenant_channel ON public.instagram_tags(tenant_id, channel_id);
CREATE INDEX idx_ig_contact_tags_contact ON public.instagram_contact_tags(contact_id);
CREATE INDEX idx_ig_contact_tags_tag ON public.instagram_contact_tags(tag_id);
CREATE INDEX idx_ig_flows_tenant ON public.instagram_flows(tenant_id, channel_id);
CREATE INDEX idx_ig_flow_versions_flow ON public.instagram_flow_versions(flow_id);
CREATE INDEX idx_ig_flow_nodes_version ON public.instagram_flow_nodes(version_id);
CREATE INDEX idx_ig_flow_edges_version ON public.instagram_flow_edges(version_id);
CREATE INDEX idx_ig_flow_runs_flow ON public.instagram_flow_runs(flow_id);
CREATE INDEX idx_ig_flow_runs_thread ON public.instagram_flow_runs(thread_id);
CREATE INDEX idx_ig_flow_runs_contact ON public.instagram_flow_runs(contact_id);
CREATE INDEX idx_ig_flow_runs_status ON public.instagram_flow_runs(status);
CREATE INDEX idx_ig_flow_run_steps_run ON public.instagram_flow_run_steps(run_id);
CREATE INDEX idx_ig_trigger_rules_flow ON public.instagram_trigger_rules(flow_id);
CREATE INDEX idx_ig_trigger_rules_type ON public.instagram_trigger_rules(trigger_type, is_active);
CREATE INDEX idx_ig_contact_pauses_contact ON public.instagram_contact_pauses(contact_id, channel_id);
CREATE INDEX idx_ig_flow_runs_idemp ON public.instagram_flow_runs(idempotency_key);

-- 9. RLS
ALTER TABLE public.instagram_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contact_pauses ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY "tenant_isolation" ON public.instagram_tags FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_contact_tags FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flows FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_versions FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_nodes FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_edges FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_runs FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_run_steps FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_trigger_rules FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_contact_pauses FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "service_role_all" ON public.instagram_tags FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_contact_tags FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flows FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_versions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_nodes FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_edges FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_runs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_run_steps FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_trigger_rules FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_contact_pauses FOR ALL TO service_role USING (true);

-- 10. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_flow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_contact_pauses;

-- 11. Updated_at triggers
CREATE TRIGGER update_instagram_flows_updated_at BEFORE UPDATE ON public.instagram_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_instagram_trigger_rules_updated_at BEFORE UPDATE ON public.instagram_trigger_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
