
-- Add predictive columns to customer_rfm_snapshots
ALTER TABLE public.customer_rfm_snapshots
  ADD COLUMN IF NOT EXISTS predicted_next_purchase_date DATE,
  ADD COLUMN IF NOT EXISTS purchase_probability_7d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS purchase_probability_15d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS purchase_probability_30d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ideal_offer_window_start INTEGER,
  ADD COLUMN IF NOT EXISTS ideal_offer_window_end INTEGER;

-- Index for predicted date queries
CREATE INDEX IF NOT EXISTS idx_rfm_predicted_date ON public.customer_rfm_snapshots(predicted_next_purchase_date) WHERE predicted_next_purchase_date IS NOT NULL;
