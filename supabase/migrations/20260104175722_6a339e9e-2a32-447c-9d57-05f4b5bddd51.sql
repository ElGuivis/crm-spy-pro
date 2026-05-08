-- Add new columns to me_shipments for enriched data
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS sender_document text,
ADD COLUMN IF NOT EXISTS sender_email text,
ADD COLUMN IF NOT EXISTS sender_phone text,
ADD COLUMN IF NOT EXISTS receiver_email text,
ADD COLUMN IF NOT EXISTS receiver_document text,
ADD COLUMN IF NOT EXISTS receiver_note text,
ADD COLUMN IF NOT EXISTS agency_name text,
ADD COLUMN IF NOT EXISTS agency_address jsonb,
ADD COLUMN IF NOT EXISTS cte_key text,
ADD COLUMN IF NOT EXISTS contract text,
ADD COLUMN IF NOT EXISTS billed_weight numeric,
ADD COLUMN IF NOT EXISTS non_commercial boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS conciliation jsonb,
ADD COLUMN IF NOT EXISTS additional_info jsonb,
ADD COLUMN IF NOT EXISTS service_details jsonb,
ADD COLUMN IF NOT EXISTS financial_details jsonb;