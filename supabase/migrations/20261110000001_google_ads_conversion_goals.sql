-- Metas de conversao da conta (categoria + origem): "biddable" diz se o Google otimiza os lances para essa meta.
CREATE TABLE IF NOT EXISTS public.google_ads_conversion_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.google_ads_accounts(id) ON DELETE CASCADE,
  category text NOT NULL,
  origin text NOT NULL,
  biddable boolean,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, category, origin)
);
CREATE INDEX IF NOT EXISTS idx_google_ads_conversion_goals_tenant ON public.google_ads_conversion_goals (tenant_id);
ALTER TABLE public.google_ads_conversion_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can view google_ads_conversion_goals" ON public.google_ads_conversion_goals FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
REVOKE ALL ON public.google_ads_conversion_goals FROM anon, authenticated;
GRANT SELECT ON public.google_ads_conversion_goals TO authenticated;
GRANT ALL ON public.google_ads_conversion_goals TO service_role;
NOTIFY pgrst, 'reload schema';
