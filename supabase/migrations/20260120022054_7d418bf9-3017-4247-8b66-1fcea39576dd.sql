-- Campos fiscais/identificadores
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS gtin TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS mpn TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS id_externo INTEGER;

-- Campos de status
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS usado BOOLEAN DEFAULT false;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS sob_consulta BOOLEAN DEFAULT false;

-- Mídia
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS url_video_youtube TEXT;

-- Relacionamentos (salvos como JSONB para flexibilidade)
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS marca JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS categorias JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS grades JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS filhos JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS seo JSONB;

-- Resource URI para referência
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS resource_uri TEXT;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_li_products_gtin ON public.li_products(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_products_ncm ON public.li_products(ncm) WHERE ncm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_products_id_externo ON public.li_products(id_externo) WHERE id_externo IS NOT NULL;