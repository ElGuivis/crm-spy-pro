-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CAMPAIGN-MEDIA (Mídia de Campanhas em Massa)
-- Bucket privado para armazenamento de mídias usadas em campanhas
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign-media', 'campaign-media', false)
ON CONFLICT (id) DO NOTHING;

-- Política para upload de mídia de campanhas (autenticado + tenant)
CREATE POLICY "Authenticated users can upload campaign media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'campaign-media');

-- Política para visualizar mídia de campanhas (autenticado)
CREATE POLICY "Authenticated users can view campaign media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'campaign-media');

-- Política para deletar mídia de campanhas (autenticado)
CREATE POLICY "Authenticated users can delete campaign media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'campaign-media');