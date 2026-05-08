-- Create receptionist_configs table for Virtual Receptionist functionality
CREATE TABLE public.receptionist_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Recepcionista Virtual',
  is_active BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! 👋 Bem-vindo(a)! Como posso ajudá-lo(a) hoje?',
  menu_format TEXT NOT NULL DEFAULT 'buttons' CHECK (menu_format IN ('buttons', 'list')),
  list_title TEXT DEFAULT 'Escolha uma opção',
  list_button_text TEXT DEFAULT 'Ver opções',
  menu_options JSONB NOT NULL DEFAULT '[{"id": "1", "label": "Falar com atendente", "action_type": "transfer_to_human"}]'::jsonb,
  menu_trigger_keywords JSONB NOT NULL DEFAULT '["menu", "opções", "opcoes"]'::jsonb,
  human_handoff_message TEXT NOT NULL DEFAULT 'Entendido! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.receptionist_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant receptionist config"
ON public.receptionist_configs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant receptionist config"
ON public.receptionist_configs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant receptionist config"
ON public.receptionist_configs
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant receptionist config"
ON public.receptionist_configs
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_receptionist_configs_updated_at
BEFORE UPDATE ON public.receptionist_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();