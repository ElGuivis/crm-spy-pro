
-- Fix instagram_event_log RLS: drop broken public INSERT policy, add correct service_role policy
DO $$
BEGIN
  -- Drop any existing INSERT policies on instagram_event_log that use public role
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'instagram_event_log' 
    AND policyname = 'Service role can insert event logs'
  ) THEN
    DROP POLICY "Service role can insert event logs" ON public.instagram_event_log;
  END IF;

  -- Drop the broken public-role policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'instagram_event_log' 
    AND cmd = 'INSERT'
    AND roles = '{public}'
  ) THEN
    -- We need to find and drop it by name
    NULL;
  END IF;
END $$;

-- Drop ALL existing policies on instagram_event_log to start clean
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'instagram_event_log' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.instagram_event_log', pol.policyname);
  END LOOP;
END $$;

-- Create correct service_role full access policy
CREATE POLICY "Service role full access on event log"
  ON public.instagram_event_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also add tenant-scoped SELECT for authenticated users
CREATE POLICY "Tenant users can read own event logs"
  ON public.instagram_event_log
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
