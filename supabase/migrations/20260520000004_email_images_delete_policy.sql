-- Fix: restrict email-images DELETE to service_role only.
-- Images are embedded in sent emails and must not be deletable by end users
-- (any authenticated user could delete another tenant's uploaded images since
-- paths are random UUIDs with no tenant prefix).
DROP POLICY IF EXISTS "Authenticated users can delete email images" ON storage.objects;
