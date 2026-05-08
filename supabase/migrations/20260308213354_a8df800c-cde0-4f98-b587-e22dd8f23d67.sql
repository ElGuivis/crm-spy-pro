
-- Create storage bucket for whitelabel assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('whitelabel-assets', 'whitelabel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: tenant users can upload
CREATE POLICY "Tenant users can upload whitelabel assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whitelabel-assets'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

-- Storage policy: public read
CREATE POLICY "Public read whitelabel assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whitelabel-assets');

-- Storage policy: tenant users can update/delete
CREATE POLICY "Tenant users can manage whitelabel assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whitelabel-assets'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);
