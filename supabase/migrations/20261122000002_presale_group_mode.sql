-- Pré-venda, modo "grupo" (formulário curto, como a página antiga fimdaout): nome, WhatsApp, e-mail e tamanhos opcionais,
-- gravados na planilha do Google (Apps Script) + cópia aqui. Não cria cliente na loja.
-- Modo "register" (cadastro completo, cria cliente) fica para a página de cadastro.

ALTER TABLE public.presale_pages
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'group',
  ADD COLUMN IF NOT EXISTS sheet_url text;

DO $$ BEGIN
  ALTER TABLE public.presale_pages ADD CONSTRAINT presale_pages_mode_check CHECK (mode IN ('group', 'register'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.presale_pages ADD CONSTRAINT presale_pages_sheet_url_check CHECK (sheet_url IS NULL OR sheet_url ~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- integração da loja só é necessária no modo cadastro
ALTER TABLE public.presale_pages ALTER COLUMN integration_id DROP NOT NULL;

ALTER TABLE public.presale_signups
  ADD COLUMN IF NOT EXISTS shirt_size text,
  ADD COLUMN IF NOT EXISTS pants_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text,
  ADD COLUMN IF NOT EXISTS sheet_status text,
  ADD COLUMN IF NOT EXISTS sheet_error text;

DO $$ BEGIN
  ALTER TABLE public.presale_signups ADD CONSTRAINT presale_signups_sheet_status_check CHECK (sheet_status IS NULL OR sheet_status IN ('sent', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- no modo grupo o cadastro na loja não acontece
ALTER TABLE public.presale_signups DROP CONSTRAINT IF EXISTS presale_signups_li_status_check;
ALTER TABLE public.presale_signups ADD CONSTRAINT presale_signups_li_status_check CHECK (li_status IN ('pending', 'created', 'existing', 'failed', 'skipped'));
