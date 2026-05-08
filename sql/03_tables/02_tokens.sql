-- =============================================================================
-- TABELAS DE TOKENS - Sistema de Créditos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TOKEN_PLANS (Planos de Tokens)
-- -----------------------------------------------------------------------------
CREATE TABLE public.token_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.token_plans IS 'Planos de compra de tokens disponíveis';

-- -----------------------------------------------------------------------------
-- TENANT_TOKENS (Saldo de Tokens por Tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  plan_id UUID REFERENCES public.token_plans(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_tokens IS 'Saldo de tokens de cada tenant';

-- -----------------------------------------------------------------------------
-- TOKEN_TRANSACTIONS (Histórico de Transações)
-- -----------------------------------------------------------------------------
CREATE TABLE public.token_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'credit', 'debit', 'purchase', 'refund'
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.token_transactions IS 'Histórico de transações de tokens';
COMMENT ON COLUMN public.token_transactions.type IS 'Tipo: credit, debit, purchase, refund';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_tenant_tokens_tenant_id ON public.tenant_tokens(tenant_id);
CREATE INDEX idx_token_transactions_tenant_id ON public.token_transactions(tenant_id);
CREATE INDEX idx_token_transactions_created_at ON public.token_transactions(created_at DESC);

-- -----------------------------------------------------------------------------
-- DADOS INICIAIS - Planos de Token
-- -----------------------------------------------------------------------------
INSERT INTO public.token_plans (name, tokens, price, is_active) VALUES
  ('Starter', 500, 29.90, true),
  ('Pro', 2000, 99.90, true),
  ('Business', 5000, 199.90, true),
  ('Enterprise', 15000, 499.90, true);
