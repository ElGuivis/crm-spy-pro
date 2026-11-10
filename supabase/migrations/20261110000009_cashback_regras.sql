-- Cashback com regras configuraveis pela tela: carencia (liberacao), cupom percentual com teto, pedido minimo,
-- cupom pessoal, desativar em cancelamento/devolucao, base sem frete, credito minimo, lista de exclusao e extrato.
-- Fluxo: pedido no status gatilho -> linha pendente em cashback_credits (release_at = agora + carencia) ->
-- cron cashback-release confere o pedido e libera (cria o cupom na loja e avisa o cliente) -> se o pedido
-- for cancelado/devolvido depois, o cupom nao usado e desativado.

ALTER TABLE public.cashback_configs
  ADD COLUMN IF NOT EXISTS release_delay_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_cart_percent numeric,
  ADD COLUMN IF NOT EXISTS min_order_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS min_order_value numeric,
  ADD COLUMN IF NOT EXISTS min_credit_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_excludes_shipping boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS personal_coupon boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cumulative boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_on_refund boolean NOT NULL DEFAULT true;

ALTER TABLE public.cashback_configs
  ADD CONSTRAINT cashback_configs_release_delay_check CHECK (release_delay_days BETWEEN 0 AND 365),
  ADD CONSTRAINT cashback_configs_max_cart_percent_check CHECK (max_cart_percent IS NULL OR (max_cart_percent > 0 AND max_cart_percent <= 100)),
  ADD CONSTRAINT cashback_configs_min_order_mode_check CHECK (min_order_mode IN ('none', 'fixed', 'multiple')),
  ADD CONSTRAINT cashback_configs_min_order_value_check CHECK (min_order_value IS NULL OR min_order_value >= 0),
  ADD CONSTRAINT cashback_configs_min_credit_check CHECK (min_credit_value >= 0);

COMMENT ON COLUMN public.cashback_configs.max_cart_percent IS 'Teto do desconto em % do carrinho da compra futura. NULL = cupom de valor fixo (modo antigo).';
COMMENT ON COLUMN public.cashback_configs.min_order_mode IS 'none | fixed (min_order_value em R$) | multiple (credito x min_order_value)';

-- Credito de cashback por pedido (livro-razao do beneficio; o cupom so existe depois de liberado)
CREATE TABLE IF NOT EXISTS public.cashback_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  integration_id uuid,
  order_number text NOT NULL,
  order_ref text,
  li_customer_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_cpf text,
  customer_key text,
  base_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  release_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  coupon_id uuid REFERENCES public.generated_coupons(id) ON DELETE SET NULL,
  skip_reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_credits_status_check CHECK (status IN ('pending', 'releasing', 'released', 'cancelled', 'skipped', 'failed')),
  CONSTRAINT cashback_credits_amount_check CHECK (base_amount >= 0 AND credit_amount >= 0),
  CONSTRAINT cashback_credits_order_unique UNIQUE (tenant_id, order_number)
);

COMMENT ON TABLE public.cashback_credits IS 'Credito de cashback por pedido: pending (carencia) -> releasing -> released (cupom criado) | cancelled | skipped | failed.';

CREATE INDEX IF NOT EXISTS cashback_credits_due_idx ON public.cashback_credits (release_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS cashback_credits_tenant_idx ON public.cashback_credits (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cashback_credits_customer_idx ON public.cashback_credits (tenant_id, customer_key);
CREATE INDEX IF NOT EXISTS cashback_credits_coupon_idx ON public.cashback_credits (coupon_id) WHERE coupon_id IS NOT NULL;

ALTER TABLE public.cashback_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's cashback credits"
  ON public.cashback_credits FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE TRIGGER update_cashback_credits_updated_at
  BEFORE UPDATE ON public.cashback_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.cashback_credits FROM anon;
GRANT SELECT ON public.cashback_credits TO authenticated;
GRANT ALL ON public.cashback_credits TO service_role;

-- Lista de exclusao: quem nunca ganha cashback (funcionarios, parceiros, fraude)
CREATE TABLE IF NOT EXISTS public.cashback_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_key text NOT NULL,
  email text,
  phone text,
  name text,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_exclusions_unique UNIQUE (tenant_id, customer_key),
  CONSTRAINT cashback_exclusions_contact_check CHECK (coalesce(btrim(email), '') <> '' OR coalesce(btrim(phone), '') <> '')
);

CREATE OR REPLACE FUNCTION public.cashback_exclusions_set_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.customer_key := public.customer_key(NEW.email, NEW.phone);
  IF NEW.customer_key IS NULL THEN
    RAISE EXCEPTION 'Informe um e-mail ou telefone valido';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cashback_exclusions_set_key
  BEFORE INSERT OR UPDATE OF email, phone ON public.cashback_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.cashback_exclusions_set_key();

REVOKE EXECUTE ON FUNCTION public.cashback_exclusions_set_key() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.cashback_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's cashback exclusions"
  ON public.cashback_exclusions FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant admins can manage cashback exclusions"
  ON public.cashback_exclusions TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  );

REVOKE ALL ON public.cashback_exclusions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashback_exclusions TO authenticated;
GRANT ALL ON public.cashback_exclusions TO service_role;

-- Extrato: um item por credito com a situacao real (pendente, disponivel, usado, vencido, cancelado...)
CREATE OR REPLACE FUNCTION public.get_cashback_statement(p_search text DEFAULT NULL, p_status text DEFAULT NULL, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid, order_number text, customer_name text, customer_email text, customer_phone text,
  base_amount numeric, credit_amount numeric, display_status text, release_at timestamptz,
  coupon_code text, expires_at timestamptz, used_at timestamptz, used_order_value numeric, skip_reason text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH x AS (
    SELECT c.id, c.order_number, c.customer_name, c.customer_email, c.customer_phone, c.base_amount, c.credit_amount,
      c.release_at, g.coupon_code, g.expires_at, g.used_at, g.used_order_value, c.skip_reason, c.created_at,
      CASE
        WHEN c.status = 'released' AND g.used_at IS NOT NULL THEN 'used'
        WHEN c.status = 'released' AND g.expires_at IS NOT NULL AND g.expires_at < now() THEN 'expired'
        WHEN c.status = 'released' THEN 'available'
        WHEN c.status = 'releasing' THEN 'pending'
        ELSE c.status
      END AS display_status
    FROM public.cashback_credits c
    LEFT JOIN public.generated_coupons g ON g.id = c.coupon_id
    WHERE c.tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
      AND (p_search IS NULL OR p_search = '' OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_email ILIKE '%' || p_search || '%'
           OR c.customer_phone ILIKE '%' || p_search || '%' OR c.order_number = p_search OR g.coupon_code ILIKE p_search)
  )
  SELECT x.id, x.order_number, x.customer_name, x.customer_email, x.customer_phone, x.base_amount, x.credit_amount,
         x.display_status, x.release_at, x.coupon_code, x.expires_at, x.used_at, x.used_order_value, x.skip_reason, x.created_at
  FROM x
  WHERE p_status IS NULL OR p_status = '' OR x.display_status = p_status
  ORDER BY x.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500) OFFSET GREATEST(p_offset, 0);
$$;

-- Saldo por situacao (cartoes do topo do extrato)
CREATE OR REPLACE FUNCTION public.get_cashback_totals()
RETURNS TABLE (display_status text, credits bigint, amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE
           WHEN c.status = 'released' AND g.used_at IS NOT NULL THEN 'used'
           WHEN c.status = 'released' AND g.expires_at IS NOT NULL AND g.expires_at < now() THEN 'expired'
           WHEN c.status = 'released' THEN 'available'
           WHEN c.status = 'releasing' THEN 'pending'
           ELSE c.status
         END AS display_status,
         count(*), coalesce(sum(c.credit_amount), 0)
  FROM public.cashback_credits c
  LEFT JOIN public.generated_coupons g ON g.id = c.coupon_id
  WHERE c.tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_cashback_statement(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cashback_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cashback_statement(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cashback_totals() TO authenticated, service_role;

-- Cron: libera creditos vencidos e desativa cupons de pedidos cancelados/devolvidos (a cada 15 min)
SELECT cron.schedule(
  'cashback-release',
  '*/15 * * * *',
  $cmd$
  SELECT net.http_post(
    url := public.functions_base_url() || '/functions/v1/cashback-release',
    headers := public.get_internal_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cmd$
);

NOTIFY pgrst, 'reload schema';
