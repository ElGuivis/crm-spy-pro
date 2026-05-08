
-- Re-add a correct service_role policy for webhook_deliveries (qual=true, not false)
CREATE POLICY "Service role full access on webhook deliveries" 
  ON public.instagram_webhook_deliveries 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);
