-- Tenant isolation no bucket email-images.
-- Antes: qualquer authenticated user podia fazer upload em qualquer "diretorio"
-- (paths eram UUIDs puros sem prefixo de tenant). Risco de abuse de storage
-- entre tenants.
-- Agora: paths sao {tenant_id}/{uuid}.ext e a policy de INSERT exige que
-- o folder1 do path seja igual ao tenant do usuario.
-- Arquivos legados (paths sem prefixo) continuam acessiveis em SELECT
-- porque o bucket e publico. Nao podem ser updated/deleted (DELETE ja foi
-- removido em 20260520000004).

-- Drop old permissive INSERT/UPDATE policies (idempotent)
DROP POLICY IF EXISTS "Authenticated users can upload email images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update email images" ON storage.objects;

-- New INSERT policy: tenant prefix obrigatorio
CREATE POLICY "Tenant members upload to own email-images folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'email-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

-- UPDATE (caso necessario): mesmo principio
CREATE POLICY "Tenant members update own email-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'email-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );
