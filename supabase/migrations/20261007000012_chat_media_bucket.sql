-- Midia recebida no atendimento (foto, audio, video, documento): o webhook baixa da Evolution e guarda aqui.
-- Antes so ficava a URL cifrada do WhatsApp (.enc), que o painel nao consegue abrir e expira.
-- Bucket privado; o painel le por URL assinada. Caminho: <tenant_id>/<conversation_id>/<message_id>.<ext>
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 16777216)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_media_tenant_read" ON storage.objects;
CREATE POLICY "chat_media_tenant_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id((SELECT auth.uid())))::text);
