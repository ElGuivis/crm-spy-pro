
-- Add media columns to bulk_campaigns
ALTER TABLE public.bulk_campaigns
ADD COLUMN media_url TEXT,
ADD COLUMN media_type TEXT DEFAULT 'text';

-- Create storage bucket for campaign media
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to campaign-media
CREATE POLICY "Authenticated users can upload campaign media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-media');

-- Allow authenticated users to read campaign media
CREATE POLICY "Anyone can read campaign media"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-media');

-- Allow authenticated users to delete their campaign media
CREATE POLICY "Authenticated users can delete campaign media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-media');
