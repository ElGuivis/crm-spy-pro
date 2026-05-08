-- Update default data_access for ai_agents table with new expanded fields
ALTER TABLE ai_agents 
ALTER COLUMN data_access 
SET DEFAULT '{"customer_details": true, "orders": true, "order_items": true, "order_tracking": true, "products": false, "products_featured": false, "products_catalog": false, "abandoned_carts": true, "coupons": true, "cashback": false, "smart_search": true}'::jsonb;

-- Create cashback_balances table if not exists (for cashback feature)
CREATE TABLE IF NOT EXISTS public.cashback_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cashback_balances ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant access
CREATE POLICY "Tenants can view their cashback balances"
ON public.cashback_balances
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_id(auth.uid())));