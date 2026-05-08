
-- Fix 1: Remove overly permissive SELECT policy on melhor_envio_tokens
-- The admin-only ALL policy already covers admin access
DROP POLICY IF EXISTS "Tenant members can view melhor_envio_tokens" ON public.melhor_envio_tokens;

-- Fix 2: Secure campaign-media storage bucket with tenant isolation

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'campaign-media';

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can read campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete campaign media" ON storage.objects;

-- Create tenant-isolated policies
CREATE POLICY "Users can read their tenant campaign media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);

CREATE POLICY "Users can upload to their tenant campaign media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);

CREATE POLICY "Users can delete their tenant campaign media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);
