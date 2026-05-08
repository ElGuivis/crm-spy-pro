-- Adicionar campos de captura de lead na tabela receptionist_configs
ALTER TABLE public.receptionist_configs
ADD COLUMN IF NOT EXISTS target_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lead_capture_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS lead_capture_name_message TEXT DEFAULT 'Para um melhor atendimento, qual é o seu nome? 😊',
ADD COLUMN IF NOT EXISTS lead_capture_phone_message TEXT DEFAULT 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:',
ADD COLUMN IF NOT EXISTS lead_capture_success_message TEXT DEFAULT 'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...';

-- Adicionar campos de estado de captura de lead na tabela conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS lead_capture_state TEXT,
ADD COLUMN IF NOT EXISTS lead_capture_data JSONB DEFAULT '{}';

-- Criar tabela de leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'receptionist',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX idx_leads_integration_id ON public.leads(integration_id);

-- Habilitar RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Política de acesso por tenant
CREATE POLICY "Tenant members can manage their leads"
  ON public.leads
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();