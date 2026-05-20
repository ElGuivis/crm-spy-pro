-- 5A: LTV prediction + churn probability columns
ALTER TABLE public.customer_rfm_snapshots
  ADD COLUMN IF NOT EXISTS first_purchase_date DATE,
  ADD COLUMN IF NOT EXISTS ltv_predicted_12m   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS churn_probability   NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.customer_rfm_snapshots.first_purchase_date  IS 'Date of the customer''s first order in this integration';
COMMENT ON COLUMN public.customer_rfm_snapshots.ltv_predicted_12m    IS 'Projected LTV for the next 12 months based on monthly spend rate';
COMMENT ON COLUMN public.customer_rfm_snapshots.churn_probability     IS 'Churn probability 0-1: recency_days / (avg_interval * 2.5), capped at 1';
