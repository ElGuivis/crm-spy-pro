-- Cashback: travas no banco contra duplicidade (a regra do codigo continua, o indice e a garantia final).
-- 1) no maximo UM cupom de cashback por pedido (por loja/tenant);
-- 2) no maximo UM lembrete de cada numero por cupom.
CREATE UNIQUE INDEX IF NOT EXISTS generated_coupons_cashback_order_unique
  ON public.generated_coupons (tenant_id, order_id)
  WHERE origin_type = 'cashback' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cashback_reminders_coupon_number_unique
  ON public.cashback_reminders (coupon_id, reminder_number);

NOTIFY pgrst, 'reload schema';
