
-- Drop the overly permissive policy
DROP POLICY "Service role full access to category RFM" ON public.customer_rfm_category_snapshots;
