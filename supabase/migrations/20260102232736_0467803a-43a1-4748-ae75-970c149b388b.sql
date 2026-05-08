-- Adicionar novas colunas à tabela me_shipments para armazenar mais dados do Melhor Envio
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS invoice jsonb,
ADD COLUMN IF NOT EXISTS volumes jsonb,
ADD COLUMN IF NOT EXISTS tags jsonb,
ADD COLUMN IF NOT EXISTS authorization_code text,
ADD COLUMN IF NOT EXISTS quote numeric,
ADD COLUMN IF NOT EXISTS products jsonb,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS generated_at timestamptz,
ADD COLUMN IF NOT EXISTS print_url text,
ADD COLUMN IF NOT EXISTS preview_url text,
ADD COLUMN IF NOT EXISTS delivery_min integer,
ADD COLUMN IF NOT EXISTS delivery_max integer,
ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz,
ADD COLUMN IF NOT EXISTS sender_name text,
ADD COLUMN IF NOT EXISTS receiver_name text,
ADD COLUMN IF NOT EXISTS receiver_phone text,
ADD COLUMN IF NOT EXISTS receiver_city text,
ADD COLUMN IF NOT EXISTS receiver_state text,
ADD COLUMN IF NOT EXISTS receiver_address jsonb,
ADD COLUMN IF NOT EXISTS insurance_value numeric,
ADD COLUMN IF NOT EXISTS discount numeric,
ADD COLUMN IF NOT EXISTS format text,
ADD COLUMN IF NOT EXISTS weight numeric,
ADD COLUMN IF NOT EXISTS dimensions jsonb,
ADD COLUMN IF NOT EXISTS posted_at timestamptz,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz DEFAULT now();

-- Habilitar Realtime na tabela me_shipments
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_shipments;