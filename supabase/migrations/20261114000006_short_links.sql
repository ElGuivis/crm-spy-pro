-- Links curtos (ex.: https://r.usechronic.com.br/ab12cd7) que redirecionam para o carrinho do cliente na loja.
-- O dominio curto e por loja: integrations.metadata.short_link_base da integracao da Loja Integrada.
CREATE TABLE IF NOT EXISTS public.short_links (
  code          text PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_url    text NOT NULL,
  fallback_url  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days',
  clicks        integer NOT NULL DEFAULT 0,
  last_click_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_short_links_expires ON public.short_links (expires_at);
CREATE INDEX IF NOT EXISTS idx_short_links_tenant ON public.short_links (tenant_id);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS short_links_service ON public.short_links;
CREATE POLICY short_links_service ON public.short_links FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS short_links_select ON public.short_links;
CREATE POLICY short_links_select ON public.short_links FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- Resolve e conta o clique numa chamada so. Vencido devolve o endereco de reserva (tela do carrinho da loja).
CREATE OR REPLACE FUNCTION public.short_link_hit(p_code text)
RETURNS TABLE (url text, expired boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.short_links s
     SET clicks = s.clicks + 1, last_click_at = now()
   WHERE s.code = p_code
  RETURNING CASE WHEN s.expires_at > now() THEN s.target_url ELSE COALESCE(s.fallback_url, s.target_url) END,
            s.expires_at <= now();
$$;
REVOKE ALL ON FUNCTION public.short_link_hit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.short_link_hit(text) TO service_role;

-- limpeza: apaga o que venceu ha mais de 30 dias
SELECT cron.schedule('short-links-cleanup-daily', '40 4 * * *', $$DELETE FROM public.short_links WHERE expires_at < now() - interval '30 days'$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'short-links-cleanup-daily');
