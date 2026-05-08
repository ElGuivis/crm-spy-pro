-- =============================================================================
-- Bling Situacoes (Status) Cache Table
-- =============================================================================

CREATE TABLE public.bling_situacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  situacao_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  id_herdado INTEGER,
  cor TEXT,
  modulo_id INTEGER NOT NULL,
  modulo_nome TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, situacao_id)
);

COMMENT ON TABLE public.bling_situacoes IS 'Cache de situações/status de pedidos do Bling';

-- Índices
CREATE INDEX idx_bling_situacoes_tenant_id ON public.bling_situacoes(tenant_id);
CREATE INDEX idx_bling_situacoes_integration_id ON public.bling_situacoes(integration_id);
CREATE INDEX idx_bling_situacoes_situacao_id ON public.bling_situacoes(situacao_id);

-- RLS
ALTER TABLE public.bling_situacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant situacoes"
  ON public.bling_situacoes FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant situacoes"
  ON public.bling_situacoes FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant situacoes"
  ON public.bling_situacoes FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access to bling_situacoes"
  ON public.bling_situacoes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);