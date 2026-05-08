
ALTER TABLE public.bulk_campaigns
ADD COLUMN delay_max_seconds INTEGER DEFAULT 360;
