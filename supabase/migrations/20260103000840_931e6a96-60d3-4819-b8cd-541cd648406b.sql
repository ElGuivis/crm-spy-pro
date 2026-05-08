-- Add integration_id to li_orders if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_orders' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_orders ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Add integration_id to li_customers if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_customers' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_customers ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Add integration_id to li_products if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_products' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_products ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_li_orders_integration ON public.li_orders(integration_id);
CREATE INDEX IF NOT EXISTS idx_li_customers_integration ON public.li_customers(integration_id);
CREATE INDEX IF NOT EXISTS idx_li_products_integration ON public.li_products(integration_id);

-- Populate existing records with integration_id based on tenant_id
-- Find the first loja_integrada integration for each tenant and assign it
UPDATE public.li_orders o
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = o.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE o.integration_id IS NULL;

UPDATE public.li_customers c
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = c.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE c.integration_id IS NULL;

UPDATE public.li_products p
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = p.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE p.integration_id IS NULL;