-- Pixel da Meta por página de pré-venda (cada loja tem o seu; carregado só na página pública).
ALTER TABLE public.presale_pages ADD COLUMN IF NOT EXISTS meta_pixel_id text;
DO $$ BEGIN
  ALTER TABLE public.presale_pages ADD CONSTRAINT presale_pages_meta_pixel_check CHECK (meta_pixel_id IS NULL OR meta_pixel_id ~ '^[0-9]{10,20}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
