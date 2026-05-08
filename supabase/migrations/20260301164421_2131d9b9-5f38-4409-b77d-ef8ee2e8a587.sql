
-- Phase 4: Data Collection, CTA Links, Quick Automations, AI Flow Drafts

-- 1. Add fields to instagram_contacts
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT;

-- 2. Add fields to instagram_messages
ALTER TABLE public.instagram_messages
  ADD COLUMN IF NOT EXISTS cta_link_id UUID,
  ADD COLUMN IF NOT EXISTS cta_click_tracked BOOLEAN DEFAULT false;

-- 3. Quick automation templates
CREATE TABLE public.instagram_quick_automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'growth',
  description TEXT,
  required_capabilities TEXT[] DEFAULT '{}',
  template_nodes JSONB NOT NULL DEFAULT '[]',
  template_edges JSONB NOT NULL DEFAULT '[]',
  trigger_config JSONB,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS on templates - they are system-level read-only
ALTER TABLE public.instagram_quick_automation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_templates" ON public.instagram_quick_automation_templates
  FOR SELECT USING (true);

-- 4. Quick automation installs
CREATE TABLE public.instagram_quick_automation_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.instagram_quick_automation_templates(id),
  flow_id UUID NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_quick_automation_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_installs" ON public.instagram_quick_automation_installs
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 5. AI flow drafts
CREATE TABLE public.instagram_ai_flow_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  objective TEXT,
  trigger_type TEXT,
  tone TEXT,
  language TEXT DEFAULT 'pt-BR',
  cta TEXT,
  data_fields TEXT[] DEFAULT '{}',
  include_handoff BOOLEAN DEFAULT false,
  generated_nodes JSONB DEFAULT '[]',
  generated_edges JSONB DEFAULT '[]',
  suggested_tags TEXT[] DEFAULT '{}',
  suggested_fields TEXT[] DEFAULT '{}',
  validation_report JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_flow_id UUID
);

ALTER TABLE public.instagram_ai_flow_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ai_drafts" ON public.instagram_ai_flow_drafts
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 6. Data collection events
CREATE TABLE public.instagram_data_collection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'flow',
  flow_id UUID,
  flow_run_id UUID,
  node_id TEXT,
  consent_given BOOLEAN DEFAULT false,
  consent_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_data_collection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_data_events" ON public.instagram_data_collection_events
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 7. CTA links
CREATE TABLE public.instagram_cta_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  ref_key TEXT,
  flow_id UUID,
  version_id UUID,
  node_id TEXT,
  click_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_cta_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_cta_links" ON public.instagram_cta_links
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 8. CTA link clicks
CREATE TABLE public.instagram_cta_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cta_link_id UUID NOT NULL REFERENCES public.instagram_cta_links(id) ON DELETE CASCADE,
  contact_id UUID,
  thread_id UUID,
  message_id UUID,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_cta_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_cta_clicks" ON public.instagram_cta_link_clicks
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 9. Insert seed quick automation templates
INSERT INTO public.instagram_quick_automation_templates (slug, name, category, description, required_capabilities, template_nodes, template_edges, sort_order) VALUES
('auto-dm-comment', 'Auto-DM por Comentário', 'growth', 'Envia DM automática quando alguém comenta em seu post ou reel', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Mensagem de boas-vindas","config":{"text":"Oi {{contact_name}}! Vi seu comentário 😊 Quer saber mais?"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 1),
('lead-gen-stories', 'Gerar Leads por Stories', 'captacao', 'Captura leads quando respondem seus stories', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Agradecimento","config":{"text":"Que bom que respondeu! 🎉"},"position_x":250,"position_y":100,"is_entry":true},{"id":"ask_email","node_type":"collect_email","label":"Pedir e-mail","config":{"prompt":"Qual seu melhor e-mail para eu te enviar?","field":"email"},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"ask_email"}]', 2),
('welcome-followers', 'Say Hi to New Followers', 'growth', 'Envia mensagem de boas-vindas a novos seguidores', '{"follow_to_dm"}',
 '[{"id":"entry","node_type":"send_text","label":"Boas-vindas","config":{"text":"Bem-vindo(a)! 🙌 Obrigado por seguir!"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 3),
('capture-email', 'Capturar E-mail via DM', 'captacao', 'Fluxo para capturar e-mail do contato via DM', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Pedir e-mail","config":{"text":"Gostaria de receber nossas novidades? Me envia seu melhor e-mail! 📧"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect","node_type":"collect_email","label":"Capturar e-mail","config":{"prompt":"","field":"email","confirm_before_save":true},"position_x":250,"position_y":220,"is_entry":false},{"id":"thanks","node_type":"send_text","label":"Agradecimento","config":{"text":"Perfeito! E-mail salvo com sucesso ✅"},"position_x":250,"position_y":340,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect"},{"source_node_id":"collect","target_node_id":"thanks"}]', 4),
('capture-phone', 'Capturar Telefone via DM', 'captacao', 'Fluxo para capturar telefone do contato via DM', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Pedir telefone","config":{"text":"Qual seu telefone com DDD para contato? 📱"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect","node_type":"collect_phone","label":"Capturar telefone","config":{"prompt":"","field":"phone"},"position_x":250,"position_y":220,"is_entry":false},{"id":"thanks","node_type":"send_text","label":"Agradecimento","config":{"text":"Telefone salvo! Obrigado 🎯"},"position_x":250,"position_y":340,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect"},{"source_node_id":"collect","target_node_id":"thanks"}]', 5),
('product-keyword', 'Link de Produto por Palavra-chave', 'vendas', 'Envia link de produto quando detecta palavra-chave no comentário', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Enviar link","config":{"text":"Aqui está o link do produto que você perguntou: {{product_url}}"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 6),
('handoff-human', 'Handoff para Humano', 'atendimento', 'Transfere conversa para atendimento humano', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Aviso","config":{"text":"Vou transferir você para um atendente. Aguarde um momento! 🙋"},"position_x":250,"position_y":100,"is_entry":true},{"id":"handoff","node_type":"handoff_to_human","label":"Transferir","config":{},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"handoff"}]', 7),
('faq-menu', 'FAQ com Persistent Menu', 'atendimento', 'Menu de perguntas frequentes via persistent menu', '{}',
 '[{"id":"entry","node_type":"send_quick_replies","label":"Menu FAQ","config":{"text":"Como posso ajudar?","options":[{"label":"Horário"},{"label":"Preços"},{"label":"Falar com humano"}]},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 8),
('ad-ctid-flow', 'Fluxo de Anúncio Click-to-IG Direct', 'anuncios', 'Fluxo de boas-vindas para leads vindos de anúncios', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Boas-vindas Ad","config":{"text":"Oi! Vi que você clicou no nosso anúncio 🎯 Como posso ajudar?"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect_email","node_type":"collect_email","label":"Capturar e-mail","config":{"prompt":"Deixa seu e-mail que te envio mais detalhes!","field":"email"},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect_email"}]', 9);
