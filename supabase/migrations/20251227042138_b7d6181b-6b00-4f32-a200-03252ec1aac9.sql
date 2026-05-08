-- Add name field to cashback_configs
ALTER TABLE public.cashback_configs
ADD COLUMN name text NOT NULL DEFAULT 'Cashback';

-- Add missing fields to generated_coupons
ALTER TABLE public.generated_coupons
ADD COLUMN customer_name text,
ADD COLUMN customer_cpf text,
ADD COLUMN coupon_value numeric;