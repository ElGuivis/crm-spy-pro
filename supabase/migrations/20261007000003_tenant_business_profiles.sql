-- Perfil do negocio por loja (tenant): o que a loja e, o que vende, politicas e tom de voz.
-- Alimenta a IA (ai-chat) com conhecimento SEPARADO por tenant. Nada de nicho fixo no codigo.

CREATE TABLE IF NOT EXISTS public.tenant_business_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_name text,
  segment text,
  about text,
  sells text,
  does_not_sell text,
  audience text,
  tone text,
  policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_rules text,
  draft_generated_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_business_profiles_size_check CHECK (
    coalesce(length(store_name), 0) <= 200
    AND coalesce(length(segment), 0) <= 200
    AND coalesce(length(about), 0) <= 4000
    AND coalesce(length(sells), 0) <= 4000
    AND coalesce(length(does_not_sell), 0) <= 2000
    AND coalesce(length(audience), 0) <= 2000
    AND coalesce(length(tone), 0) <= 1000
    AND coalesce(length(extra_rules), 0) <= 4000
    AND length(policies::text) <= 12000
  )
);

COMMENT ON TABLE public.tenant_business_profiles IS
  'Perfil do negocio por tenant para a IA. policies: jsonb com chaves shipping, returns, payment, hours, wholesale, warranty, contact.';

ALTER TABLE public.tenant_business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's business profile"
  ON public.tenant_business_profiles FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

CREATE POLICY "Tenant admins can manage business profile"
  ON public.tenant_business_profiles TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid())))
    AND public.is_tenant_admin((SELECT auth.uid()), tenant_id)
  );

CREATE TRIGGER update_tenant_business_profiles_updated_at
  BEFORE UPDATE ON public.tenant_business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.tenant_business_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_business_profiles TO authenticated;
GRANT ALL ON public.tenant_business_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
