
-- Drop the overly permissive service role policy and replace with specific ones
DROP POLICY "Service role can manage rfm_alerts" ON public.rfm_alerts;

-- Insert policy for service role (edge functions use service_role key which bypasses RLS)
-- So we only need user-facing policies which are already created
-- Service role bypasses RLS by default, no extra policy needed
