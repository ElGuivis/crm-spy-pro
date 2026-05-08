-- Tabela para armazenar states do OAuth (anti-CSRF)
CREATE TABLE public.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  redirect_path TEXT DEFAULT '/integrations',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS: Service role only (backend access)
CREATE POLICY "Service role can manage oauth_states"
ON public.oauth_states
FOR ALL
USING (true)
WITH CHECK (true);

-- Tabela unificada para conexões Meta (Facebook, Instagram, WhatsApp)
CREATE TABLE public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  
  -- Facebook User Info
  fb_user_id TEXT,
  fb_user_name TEXT,
  
  -- Access Token (será criptografado no backend)
  fb_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  
  -- Assets selecionados
  selected_pages JSONB DEFAULT '[]'::jsonb,
  selected_instagram JSONB DEFAULT '[]'::jsonb,
  
  -- WhatsApp Cloud API
  whatsapp JSONB DEFAULT NULL,
  
  -- Status e timestamps
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: um registro por tenant
  CONSTRAINT unique_tenant_meta_connection UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant meta connections"
ON public.meta_connections
FOR SELECT
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert meta connections for their tenant"
ON public.meta_connections
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta connections"
ON public.meta_connections
FOR UPDATE
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta connections"
ON public.meta_connections
FOR DELETE
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_meta_connections_updated_at
BEFORE UPDATE ON public.meta_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para performance
CREATE INDEX idx_meta_connections_tenant_id ON public.meta_connections(tenant_id);
CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states(expires_at);