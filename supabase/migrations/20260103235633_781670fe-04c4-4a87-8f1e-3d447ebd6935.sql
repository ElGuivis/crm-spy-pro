-- Create bling_connections table
CREATE TABLE public.bling_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status TEXT DEFAULT 'connected',
  bling_user_id TEXT,
  bling_user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on tenant_id (one connection per tenant)
CREATE UNIQUE INDEX bling_connections_tenant_id_idx ON public.bling_connections(tenant_id);

-- Enable Row Level Security
ALTER TABLE public.bling_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their tenant's bling connections" 
ON public.bling_connections 
FOR SELECT 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can insert their tenant's bling connections" 
ON public.bling_connections 
FOR INSERT 
WITH CHECK (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can update their tenant's bling connections" 
ON public.bling_connections 
FOR UPDATE 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can delete their tenant's bling connections" 
ON public.bling_connections 
FOR DELETE 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bling_connections_updated_at
BEFORE UPDATE ON public.bling_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();