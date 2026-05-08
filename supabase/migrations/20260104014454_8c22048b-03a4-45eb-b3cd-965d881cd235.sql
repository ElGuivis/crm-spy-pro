-- Add additional customer fields to bling_customers table
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS sexo TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS naturalidade TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS orgao_emissor TEXT;

-- Add index for birthday queries (useful for birthday campaigns)
CREATE INDEX IF NOT EXISTS idx_bling_customers_data_nascimento ON public.bling_customers(data_nascimento);