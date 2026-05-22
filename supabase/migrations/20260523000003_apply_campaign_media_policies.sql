-- A migration 20260222144311 (que criava policies para campaign-media)
-- nunca foi aplicada em prod (descoberto na auditoria de 2026-05-23).
-- O bucket existe e e privado, mas sem policies = inutilizavel.
-- Frontend CreateCampaignDialog.tsx ja usa path com prefixo {tenant_id}/X.
-- Bucket esta vazio (zero objects), entao aplicar agora nao quebra nada
-- legado.

-- Garantir que o bucket e privado (se ja for, no-op)
UPDATE storage.buckets SET public = false WHERE id = 'campaign-media';

-- Drop policies antigas se existirem (idempotente)
DROP POLICY IF EXISTS "Anyone can read campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their tenant campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their tenant campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their tenant campaign media" ON storage.objects;

-- SELECT: tenant members podem ler arquivos do proprio tenant
CREATE POLICY "Users can read their tenant campaign media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

-- INSERT: tenant members podem uploadar no proprio diretorio
CREATE POLICY "Users can upload to their tenant campaign media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

-- DELETE: tenant members podem deletar arquivos do proprio tenant
CREATE POLICY "Users can delete their tenant campaign media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );
