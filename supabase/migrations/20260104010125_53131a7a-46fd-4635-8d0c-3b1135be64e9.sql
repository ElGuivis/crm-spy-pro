-- Add bling_store_ids column to integrations table for storing selected Bling stores
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS bling_store_ids integer[] DEFAULT NULL;