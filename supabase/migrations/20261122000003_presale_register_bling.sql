-- Página de cadastro (/cadastro/<slug>, modo "register"): cadastro completo que vira CONTATO no Bling
-- (a Loja Integrada só leva cliente ao Bling junto com pedido). Mesmo slug pode ter página de grupo e de cadastro.

ALTER TABLE public.presale_pages DROP CONSTRAINT IF EXISTS presale_pages_slug_key;
DO $$ BEGIN
  ALTER TABLE public.presale_pages ADD CONSTRAINT presale_pages_slug_mode_key UNIQUE (slug, mode);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- página de cadastro não leva a grupo
ALTER TABLE public.presale_pages ALTER COLUMN whatsapp_group_url DROP NOT NULL;

ALTER TABLE public.presale_signups
  ADD COLUMN IF NOT EXISTS bling_contact_id bigint,
  ADD COLUMN IF NOT EXISTS bling_status text,
  ADD COLUMN IF NOT EXISTS bling_error text;

DO $$ BEGIN
  ALTER TABLE public.presale_signups ADD CONSTRAINT presale_signups_bling_status_check CHECK (bling_status IS NULL OR bling_status IN ('created', 'existing', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
