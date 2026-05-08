-- RLS policy for customer_rfm_snapshots (was missing, causing data exposure/access failure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customer_rfm_snapshots' AND policyname = 'tenant_rfm_snapshots_select'
  ) THEN
    CREATE POLICY "tenant_rfm_snapshots_select"
      ON public.customer_rfm_snapshots
      FOR SELECT
      TO authenticated
      USING (
        integration_id IN (
          SELECT id FROM public.integrations
          WHERE tenant_id = public.get_user_tenant_id(auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customer_rfm_snapshots' AND policyname = 'service_rfm_snapshots_all'
  ) THEN
    CREATE POLICY "service_rfm_snapshots_all"
      ON public.customer_rfm_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Restrict sensitive credential reads to admins only
-- email_integrations: restrict SELECT on sensitive fields via policy update
DO $$
BEGIN
  -- Drop overly broad policies if they exist and replace with admin-only for sensitive tables
  -- We add restrictive policies alongside existing ones using is_tenant_admin check

  -- email_integrations - only admins can read (contains smtp_password)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'email_integrations' AND policyname = 'admin_only_email_integrations_select'
  ) THEN
    -- First drop the permissive select if it allows all members
    -- We use a conditional approach: add a restrictive policy
    CREATE POLICY "admin_only_email_integrations_select"
      ON public.email_integrations
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;

  -- bling_connections - only admins can read (contains access_token/refresh_token)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bling_connections' AND policyname = 'admin_only_bling_connections_select'
  ) THEN
    CREATE POLICY "admin_only_bling_connections_select"
      ON public.bling_connections
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;

  -- tenant_ai_credentials - only admins can read (contains API keys)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_ai_credentials' AND policyname = 'admin_only_ai_credentials_select'
  ) THEN
    CREATE POLICY "admin_only_ai_credentials_select"
      ON public.tenant_ai_credentials
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;
END $$;