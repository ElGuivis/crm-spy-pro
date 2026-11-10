-- Aniversário: opções do cupom na tela (tipo, valor fixo, teto, pedido mínimo, acumulativo, pessoal), como no cashback.
-- Os padrões mantêm o comportamento antigo (percentual, sem mínimo, não acumulativo) e tornam o cupom pessoal por padrão.
ALTER TABLE public.birthday_configs
  ADD COLUMN IF NOT EXISTS coupon_type text NOT NULL DEFAULT 'porcentagem',
  ADD COLUMN IF NOT EXISTS coupon_fixed_value numeric,
  ADD COLUMN IF NOT EXISTS max_discount_value numeric,
  ADD COLUMN IF NOT EXISTS min_order_value numeric,
  ADD COLUMN IF NOT EXISTS cumulative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_coupon boolean NOT NULL DEFAULT true;

ALTER TABLE public.birthday_configs
  DROP CONSTRAINT IF EXISTS birthday_configs_coupon_type_check,
  ADD CONSTRAINT birthday_configs_coupon_type_check CHECK (coupon_type IN ('porcentagem', 'fixo', 'frete_gratis')),
  DROP CONSTRAINT IF EXISTS birthday_configs_values_check,
  ADD CONSTRAINT birthday_configs_values_check CHECK (
    (coupon_type <> 'fixo' OR COALESCE(coupon_fixed_value, 0) > 0)
    AND COALESCE(max_discount_value, 0) >= 0 AND COALESCE(min_order_value, 0) >= 0);
