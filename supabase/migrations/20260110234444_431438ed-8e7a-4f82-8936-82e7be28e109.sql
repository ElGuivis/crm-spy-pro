-- Create table for Bling code mappings (order status and payment methods)
CREATE TABLE public.bling_code_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('order_status', 'payment_method')),
  original_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, mapping_type, original_code)
);

-- Enable RLS
ALTER TABLE public.bling_code_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies using the same pattern as other tables
CREATE POLICY "bling_code_mappings_select" ON public.bling_code_mappings 
FOR SELECT TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_insert" ON public.bling_code_mappings 
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_update" ON public.bling_code_mappings 
FOR UPDATE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_delete" ON public.bling_code_mappings 
FOR DELETE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_bling_code_mappings_lookup ON public.bling_code_mappings(integration_id, mapping_type);

-- Create trigger for updated_at
CREATE TRIGGER update_bling_code_mappings_updated_at
BEFORE UPDATE ON public.bling_code_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();