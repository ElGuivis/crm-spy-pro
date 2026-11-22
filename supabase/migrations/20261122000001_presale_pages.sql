-- Páginas de pré-venda (cadastro público → cliente na Loja Integrada → grupo VIP do WhatsApp).
-- A página é pública (/vip/<slug>); só a edge function `presale-signup` (service_role) lê a configuração e grava cadastros.

CREATE TABLE IF NOT EXISTS public.presale_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
  title text NOT NULL,
  whatsapp_group_url text NOT NULL CHECK (whatsapp_group_url ~ '^https://chat\.whatsapp\.com/'),
  li_group_id integer,               -- grupo de clientes da loja (nulo = grupo padrão)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_pages_tenant ON public.presale_pages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_presale_pages_integration ON public.presale_pages (integration_id);

CREATE TABLE IF NOT EXISTS public.presale_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.presale_pages(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  cpf text,                          -- a Loja Integrada exige CPF para pessoa física
  phone text NOT NULL,
  birth_date date,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepts_newsletter boolean NOT NULL DEFAULT false,
  li_customer_id bigint,
  li_status text NOT NULL DEFAULT 'pending' CHECK (li_status IN ('pending', 'created', 'existing', 'failed')),
  li_error text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_presale_signup_email UNIQUE (page_id, email)
);
CREATE INDEX IF NOT EXISTS idx_presale_signups_tenant_created ON public.presale_signups (tenant_id, created_at DESC);

ALTER TABLE public.presale_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presale_signups ENABLE ROW LEVEL SECURITY;

-- Equipe da loja só LÊ (cadastros vêm da edge function com service_role).
DROP POLICY IF EXISTS presale_pages_select ON public.presale_pages;
CREATE POLICY presale_pages_select ON public.presale_pages FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

DROP POLICY IF EXISTS presale_signups_select ON public.presale_signups;
CREATE POLICY presale_signups_select ON public.presale_signups FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

REVOKE ALL ON public.presale_pages, public.presale_signups FROM anon;
GRANT SELECT ON public.presale_pages, public.presale_signups TO authenticated;
GRANT ALL ON public.presale_pages, public.presale_signups TO service_role;
