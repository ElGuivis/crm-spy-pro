
-- Add store_integration_id to integrations table (links ME integration to a store)
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.integrations.store_integration_id IS 'Para integrações de envio (melhor_envio): qual loja está vinculada';

CREATE INDEX IF NOT EXISTS idx_integrations_store_integration_id ON public.integrations(store_integration_id);

-- Add bling_order_id to me_shipments for linking to Bling orders
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS bling_order_id UUID REFERENCES public.bling_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_me_shipments_bling_order_id ON public.me_shipments(bling_order_id);
