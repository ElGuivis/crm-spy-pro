-- Add columns for imported coupons from Loja Integrada
ALTER TABLE generated_coupons 
ADD COLUMN IF NOT EXISTS li_coupon_id INTEGER,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cashback',
ADD COLUMN IF NOT EXISTS coupon_type TEXT,
ADD COLUMN IF NOT EXISTS coupon_description TEXT,
ADD COLUMN IF NOT EXISTS li_data_inicio TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS li_data_fim TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS li_quantidade_uso_maximo INTEGER,
ADD COLUMN IF NOT EXISTS li_quantidade_usada INTEGER DEFAULT 0;

-- Create index for li_coupon_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_generated_coupons_li_coupon_id ON generated_coupons(li_coupon_id);

-- Create index for source to filter by origin
CREATE INDEX IF NOT EXISTS idx_generated_coupons_source ON generated_coupons(source);