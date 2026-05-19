-- Create storage bucket for email campaign images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-images',
  'email-images',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images (scoped via tenant via RLS on objects)
CREATE POLICY "Authenticated users can upload email images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'email-images');

-- Public read (images are embedded in emails, read by anyone)
CREATE POLICY "Email images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'email-images');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete email images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'email-images');
