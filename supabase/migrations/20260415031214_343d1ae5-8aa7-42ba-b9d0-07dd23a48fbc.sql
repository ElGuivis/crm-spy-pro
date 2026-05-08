
ALTER TABLE public.reactivation_cycle_steps 
  ADD COLUMN IF NOT EXISTS use_custom_coupon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_discount_percent integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coupon_duration_days integer DEFAULT NULL;
