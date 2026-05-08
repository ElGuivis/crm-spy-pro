-- Table for AI agents that can be assigned to specific Kanban columns
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  welcome_message TEXT,
  transfer_keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1024,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to assign AI agents to specific Kanban columns
CREATE TABLE public.ai_agent_column_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(column_id, tenant_id) -- Only one agent per column per tenant
);

-- Table for notification settings
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_volume NUMERIC(3,2) DEFAULT 0.5,
  desktop_notifications BOOLEAN NOT NULL DEFAULT true,
  new_message_sound TEXT DEFAULT 'default',
  new_conversation_sound TEXT DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_column_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_agents
CREATE POLICY "Users can view their tenant's AI agents"
  ON public.ai_agents FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create AI agents for their tenant"
  ON public.ai_agents FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's AI agents"
  ON public.ai_agents FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their tenant's AI agents"
  ON public.ai_agents FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- RLS policies for ai_agent_column_assignments
CREATE POLICY "Users can view their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create agent assignments for their tenant"
  ON public.ai_agent_column_assignments FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- RLS policies for notification_settings
CREATE POLICY "Users can view their tenant's notification settings"
  ON public.notification_settings FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create notification settings for their tenant"
  ON public.notification_settings FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's notification settings"
  ON public.notification_settings FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_column_assignments;