-- O índice único de (integração, código) era PARCIAL (WHERE integration_id IS NOT NULL). O PostgREST/supabase-js faz
-- upsert com ON CONFLICT (integration_id, coupon_code) sem o predicado, e o Postgres só aceita a inferência com um
-- índice único completo: "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- Resultado: o "Sincronizar" de Cupons salvava 0 de N. NULL nunca conflita em índice único, então o parcial era desnecessário.
DROP INDEX IF EXISTS public.generated_coupons_integration_code_uniq;
CREATE UNIQUE INDEX generated_coupons_integration_code_uniq
  ON public.generated_coupons (integration_id, coupon_code);
