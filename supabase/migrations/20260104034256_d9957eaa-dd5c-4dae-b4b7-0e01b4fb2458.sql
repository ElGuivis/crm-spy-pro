-- Add store_integration_id to ai_agents for multi-store support
ALTER TABLE public.ai_agents 
ADD COLUMN store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ai_agents.store_integration_id IS 'ID da integração de loja para consulta de dados (pedidos, clientes, produtos). Se NULL, usa detecção automática.';